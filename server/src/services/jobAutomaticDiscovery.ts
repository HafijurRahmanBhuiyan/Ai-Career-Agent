import {
  JobSearchParams,
  JobSource,
  SourceReport,
} from "../integrations/jobs/jobSource.types";
import { getEnabledJobSources } from "../integrations/jobs/jobSourceRegistry";
import { discoverJobs } from "./jobDiscovery";
import { resolveDiscoveryParams } from "./jobSearchPreferences";
import { IProfile } from "../models/Profile";
import { Role } from "../types";

/**
 * Canonical, global automatic job discovery (Phase 1, Step 7).
 *
 * Unlike the authenticated `/api/jobs/discover` per-user endpoint, this path
 * ingests for ALL eligible users at once using a single, deduplicated set of
 * search queries (so the exact same source query is never issued repeatedly,
 * one request per distinct query per source). The existing n8n scheduler
 * triggers this admin-only internal endpoint, and a follow-up stale cleanup
 * runs afterwards.
 *
 * Eligibility / account state:
 *   - A user is an eligible source of preferences when their account is active
 *     (`User.isActive === true`) and they are NOT an admin/service account
 *     (`User.role === UserRole.USER`).
 *   - They must also have a Profile whose effective discovery parameters carry
 *     at least one actionable signal (roles/keywords, locations, or remote).
 *     Profiles with nothing actionable are skipped; discovery never invents
 *     preferences on the user's behalf.
 *
 * Preference precedence is inherited from `resolveDiscoveryParams` (explicit >
 * saved > legacy > source default) unchanged.
 *
 * Query deduplication: every eligible user's resolved parameters are collapsed
 * into a canonical identity key. Identical combinations from different users
 * are merged into a single query. Report statistics expose how many naive
 * (per-user) requests were avoided.
 */

export interface EligibleUser {
  userId: string;
  params: JobSearchParams;
}

export interface AutomaticDiscoveryStats {
  /** Total users with active, non-admin accounts (the pool considered). */
  eligibleAccounts: number;
  /** Users whose profile yielded a usable (non-empty) set of discovery parameters. */
  profilesUsed: number;
  /** Users skipped (inactive account, admin, or no actionable params). */
  profilesSkipped: number;
  /** Count of canonical queries deduplicated out (naive - actual). */
  dedupedQueries: number;
}

export interface AutomaticDiscoveryResult {
  /** Success/error report per (query, source). */
  sources: SourceReport[];
  /** Number of jobs persisted this run (across all queries). */
  count: number;
  /** Number of distinct queries issued. */
  queryCount: number;
  /** Aggregated discovery statistics. */
  stats: AutomaticDiscoveryStats;
}

/** User-ish shape used for eligibility checks (subset of IUser). */
export interface AccountLike {
  isActive: boolean;
  role: Role | string;
  _id?: { toString(): string } | string;
  id?: string;
}

function userIdOf(user: AccountLike | unknown): string {
  const obj = user as AccountLike;
  if (typeof obj.id === "string") return obj.id;
  const id = (obj as { _id?: unknown })?._id;
  if (id) {
    if (typeof id === "string") return id;
    if (typeof (id as { toString?: () => string }).toString === "function") {
      return (id as { toString: () => string }).toString();
    }
  }
  if (typeof (obj as { toString?: () => string }).toString === "function") {
    return (obj as { toString: () => string }).toString();
  }
  return "unknown";
}

function isAdminOrService(user: AccountLike): boolean {
  const role = String(user.role ?? Role.USER).toLowerCase();
  return role !== Role.USER.toLowerCase();
}

export function buildDiscoveryQueryKey(params: JobSearchParams): string {
  const keyword = (params.keywords ?? "").trim().toLowerCase();
  const roles = (params.roles ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  const locations = (params.locations ?? [])
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  return [
    keyword,
    roles.join("|"),
    locations.join("|"),
    (params.remote ?? "").toLowerCase(),
    (params.experienceLevel ?? "").toLowerCase(),
    (params.employmentType ?? "").toLowerCase(),
    typeof params.salaryMinimum === "number" ? String(params.salaryMinimum) : "",
  ].join("::");
}

/**
 * Resolve each eligible user's effective discovery parameters.
 *
 * A profile is skipped when it yields no actionable signal (no keyword/roles,
 * no locations, and no remote filter). An account is skipped when it is
 * inactive or an admin/service account.
 */
export function collectEligibleUsers(
  profiles: Array<Pick<IProfile, "user" | "preferredRoles" | "preferredLocations" | "workPreference" | "jobSearchPreferences"> | null | undefined>,
  users: Map<string, AccountLike> | Array<AccountLike> | null | undefined,
  requestParams?: Partial<JobSearchParams>
): { eligible: EligibleUser[]; skipped: number; eligibleAccounts: number } {
  const accountMap = new Map<string, AccountLike>();
  if (Array.isArray(users)) {
    for (const u of users) accountMap.set(userIdOf(u), u);
  } else if (users) {
    for (const [k, v] of users) accountMap.set(k, v);
  }

  const eligible: EligibleUser[] = [];
  let skipped = 0;
  let eligibleAccounts = 0;

  for (const profile of profiles) {
    if (!profile) {
      skipped += 1;
      continue;
    }

    const userId = userIdOf(profile.user as unknown as AccountLike);
    const account = accountMap.get(userId);

    if (!account || !account.isActive || isAdminOrService(account)) {
      skipped += 1;
      continue;
    }

    eligibleAccounts += 1;

    const params = resolveDiscoveryParams(requestParams ?? {}, profile);
    const hasSignal =
      Boolean(params.keywords?.trim()) ||
      (params.roles ?? []).some((r) => r.trim()) ||
      (params.locations ?? []).some((l) => l.trim()) ||
      Boolean(params.remote && params.remote !== "any");

    if (!hasSignal) {
      skipped += 1;
      continue;
    }

    eligible.push({ userId, params });
  }

  return { eligible, skipped, eligibleAccounts };
}

/** Collapse eligible users into a single distinct query set keyed by canonical identity. */
export function deduplicateQueries(
  eligible: EligibleUser[]
): { queryUsers: Array<{ key: string; params: JobSearchParams; users: string[] }>; naiveCount: number } {
  const map = new Map<string, { params: JobSearchParams; users: string[] }>();
  for (const entry of eligible) {
    const key = buildDiscoveryQueryKey(entry.params);
    const existing = map.get(key);
    if (existing) {
      if (!existing.users.includes(entry.userId)) existing.users.push(entry.userId);
    } else {
      map.set(key, { params: entry.params, users: [entry.userId] });
    }
  }
  const queryUsers = Array.from(map.entries()).map(([key, v]) => ({
    key,
    params: v.params,
    users: v.users,
  }));
  return { queryUsers, naiveCount: eligible.length };
}

/**
 * Run canonical global discovery.
 *
 * Each distinct query is issued ONCE per source. A failing source is recorded
 * as an error report for that query and never aborts the run (partial success).
 * Job persistence (normalize -> cross-source dedupe -> upsert with lastSeenAt /
 * isActive refresh) is delegated to the existing `discoverJobs` pipeline, so no
 * schema or matching behaviour is altered here.
 */
export async function runAutomaticDiscovery(
  options: {
    profiles?: Array<Pick<IProfile, "user" | "preferredRoles" | "preferredLocations" | "workPreference" | "jobSearchPreferences"> | null | undefined>;
    users?: Map<string, AccountLike> | Array<AccountLike> | null;
    sources?: JobSource[];
    requestParams?: Partial<JobSearchParams>;
  } = {}
): Promise<AutomaticDiscoveryResult> {
  const sources = options.sources ?? getEnabledJobSources();
  const { eligible, skipped, eligibleAccounts } = collectEligibleUsers(
    options.profiles ?? [],
    options.users,
    options.requestParams
  );

  const { queryUsers, naiveCount } = deduplicateQueries(eligible);

  const reports: SourceReport[] = [];
  let totalCount = 0;

  for (const q of queryUsers) {
    const result = await discoverJobs(q.params, sources);
    totalCount += result.count;
    reports.push(
      ...result.sources.map((s) => ({
        source: s.source,
        status: s.status,
        count: s.count,
        message: s.message,
      }))
    );
  }

  const actualQueries = queryUsers.length;
  const dedupedQueries = Math.max(0, naiveCount - actualQueries);

  return {
    sources: reports,
    count: totalCount,
    queryCount: actualQueries,
    stats: {
      eligibleAccounts,
      profilesUsed: eligible.length,
      profilesSkipped: skipped,
      dedupedQueries,
    },
  };
}
