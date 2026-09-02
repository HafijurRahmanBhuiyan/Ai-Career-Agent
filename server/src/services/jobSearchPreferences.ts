import { IProfile } from "../models/Profile";
import { JobSearchParams } from "../integrations/jobs/jobSource.types";

type ProfileDoc = Pick<
  IProfile,
  "preferredRoles" | "preferredLocations" | "workPreference" | "jobSearchPreferences"
>;

/**
 * Resolve effective discovery parameters using a strict precedence rule:
 *
 *   1. Explicit request parameters (user-supplied for this call)
 *   2. Profile.jobSearchPreferences (saved search preferences)
 *   3. Legacy profile fields (preferredRoles / preferredLocations / workPreference)
 *   4. Source defaults (implicit — caller passes nothing)
 *
 * Explicit parameters are NEVER silently overridden by saved preferences.
 */
export function resolveDiscoveryParams(
  requestParams: Partial<JobSearchParams>,
  profile: ProfileDoc | null | undefined
): JobSearchParams {
  const jsp = profile?.jobSearchPreferences;

  // --- roles / keywords ---
  // roles are not consumed by any source; the only effective mechanism is to
  // use the first role as a keyword fallback when no explicit keywords are set.
  const resolvedRoles =
    requestParams.roles ??
    (jsp?.roles && jsp.roles.length > 0 ? jsp.roles : undefined) ??
    (profile?.preferredRoles && profile.preferredRoles.length > 0
      ? profile.preferredRoles
      : undefined);

  const resolvedKeywords =
    requestParams.keywords ??
    (resolvedRoles && resolvedRoles.length > 0 ? resolvedRoles[0] : undefined);

  // --- locations ---
  const resolvedLocations =
    requestParams.locations ??
    (jsp?.locations && jsp.locations.length > 0 ? jsp.locations : undefined) ??
    (profile?.preferredLocations && profile.preferredLocations.length > 0
      ? profile.preferredLocations
      : undefined);

  // --- remote ---
  const requestRemote = requestParams.remote;
  const jspRemote = jsp?.remote;
  const legacyRemote = profile?.workPreference;
  const resolvedRemote =
    requestRemote ??
    (jspRemote && jspRemote !== "" && jspRemote !== "any"
      ? (jspRemote as JobSearchParams["remote"])
      : undefined) ??
    (legacyRemote && legacyRemote !== ""
      ? (legacyRemote as JobSearchParams["remote"])
      : undefined);

  // --- employmentType (not stored in preferences — explicit only) ---
  const resolvedEmploymentType = requestParams.employmentType;

  // --- experienceLevel ---
  const resolvedExperienceLevel =
    requestParams.experienceLevel ??
    (jsp?.experienceLevel && jsp.experienceLevel !== ""
      ? (jsp.experienceLevel as JobSearchParams["experienceLevel"])
      : undefined);

  // --- salaryMinimum ---
  const resolvedSalaryMinimum =
    requestParams.salaryMinimum ??
    (typeof jsp?.salaryMinimum === "number" ? jsp.salaryMinimum : undefined);

  return {
    keywords: resolvedKeywords,
    roles: resolvedRoles,
    locations: resolvedLocations,
    remote: resolvedRemote,
    employmentType: resolvedEmploymentType,
    experienceLevel: resolvedExperienceLevel,
    salaryMinimum: resolvedSalaryMinimum,
    page: requestParams.page,
    limit: requestParams.limit,
  };
}
