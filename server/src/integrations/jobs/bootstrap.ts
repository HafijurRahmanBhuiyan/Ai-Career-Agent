import { registerJobSource, getJobSource } from "./jobSourceRegistry";
import { AdzunaJobSource } from "./sources/adzunaJobSource";
import { ArbeitnowJobSource } from "./sources/arbeitnowJobSource";
import { RemoteOkJobSource } from "./sources/remoteOkJobSource";
import { MockJobSource } from "./sources/mockJobSource";

/**
 * Decide which live job sources should be registered for the given
 * environment. Exposed as a pure helper so bootstrap behaviour can be tested
 * deterministically without mutating the shared source registry.
 *
 * Source availability rules:
 *  - Adzuna requires ADZUNA_APP_ID and ADZUNA_APP_KEY.
 *  - RemoteOK and Arbeitnow are public and require no credentials.
 *  - The Mock source is a development/test fixture only and is never
 *    registered in production.
 */
export function selectJobSources(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const ids: string[] = [];

  if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) {
    ids.push("adzuna");
  }

  ids.push("arbeitnow", "remoteok");

  if (env.NODE_ENV !== "production") {
    ids.push("mock");
  }

  return ids;
}

function sourceIdsToFactories(ids: string[]): Array<{ id: string; factory: () => import("./jobSource.types").JobSource }> {
  const entries: Array<{ id: string; factory: () => import("./jobSource.types").JobSource }> = [];
  for (const id of ids) {
    switch (id) {
      case "adzuna":
        entries.push({ id, factory: () => new AdzunaJobSource() });
        break;
      case "arbeitnow":
        entries.push({ id, factory: () => new ArbeitnowJobSource() });
        break;
      case "remoteok":
        entries.push({ id, factory: () => new RemoteOkJobSource() });
        break;
      case "mock":
        entries.push({ id, factory: () => new MockJobSource() });
        break;
      default:
        break;
    }
  }
  return entries;
}

/**
 * Register the configured live job sources into the shared registry. Safe to
 * call more than once: sources already registered under the same id are
 * skipped, and the underlying registry overwrites by id so duplicates can
 * never accumulate. Adzuna is only registered when its credentials exist, and
 * startup never fails simply because those credentials are missing.
 */
export function bootstrapJobSources(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const enabled: string[] = [];
  const skipped: string[] = [];

  const entries = sourceIdsToFactories(selectJobSources(env));
  const selectedIds = new Set(entries.map((e) => e.id));

  for (const { id, factory } of entries) {
    if (getJobSource(id)) {
      enabled.push(id);
      continue;
    }
    registerJobSource(factory);
    enabled.push(id);
  }

  if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) {
    if (!selectedIds.has("adzuna")) {
      skipped.push("adzuna");
    }
  } else {
    skipped.push("adzuna");
  }

  // eslint-disable-next-line no-console
  console.log(
    `[jobs] Bootstrap complete. Enabled job sources: ${enabled.join(", ") || "none"}`
  );
  if (skipped.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[jobs] Disabled job sources (missing configuration): ${skipped.join(", ")}`
    );
  }

  return enabled;
}
