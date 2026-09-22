import GmailConnection from "../models/GmailConnection";
import { GmailService, runWithConcurrency } from "./gmail";

const DEFAULT_INTERVAL_MINUTES = 1;
const MIN_INTERVAL_MINUTES = 1;
// Bound each background pass so it never floods the Gmail API.
const AUTO_SYNC_BATCH_MAX = 25;
// Connections are synced with bounded concurrency so one slow account never
// serializes the whole user base.
const CONNECTION_CONCURRENCY = 5;
// Initial warm-up pass shortly after boot so recently received career emails
// surface without waiting a full interval.
const INITIAL_DELAY_MS = 30 * 1000;

let timer: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;
let running = false;

function intervalMinutes(): number {
  const raw = Number(process.env.GMAIL_AUTO_SYNC_INTERVAL_MINUTES);
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MINUTES;
  return Math.max(MIN_INTERVAL_MINUTES, raw);
}

/**
 * One background pass: sync recent Gmail messages for every user with an
 * active connection whose last sync is older than the interval (or never).
 * Connections run with bounded concurrency; a single user's failure never
 * aborts the pass or the other users. Does not touch request-scoped AI
 * progress (no ALS requestId), so attempts are classified silently in the
 * background.
 */
export async function runGmailAutoSync(): Promise<void> {
  if (running) {
    return;
  }
  running = true;
  try {
    const minutes = intervalMinutes();
    const threshold = new Date(Date.now() - minutes * 60 * 1000);

    const connections = await GmailConnection.find({
      isActive: true,
      $or: [
        { lastSyncedAt: null },
        { lastSyncedAt: { $lt: threshold } },
      ],
    })
      .select({ user: 1, lastSyncedAt: 1 })
      .lean();

    const service = new GmailService();
    await runWithConcurrency(
      connections,
      CONNECTION_CONCURRENCY,
      async (connection) => {
        try {
          await service.syncEmails(
            String(connection.user),
            AUTO_SYNC_BATCH_MAX
          );
        } catch (error) {
          console.error(
            `[gmail-autosync] sync failed for user ${String(connection.user)}:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    );
  } catch (error) {
    console.error(
      "[gmail-autosync] pass failed:",
      error instanceof Error ? error.message : error
    );
  } finally {
    running = false;
  }
}

/**
 * Start the recurring career-email refresh. Idempotent; safe to call multiple
 * times. Timers are `.unref()`-ed so they never hold the process open.
 */
export function startGmailAutoSync(): void {
  if (timer) {
    return;
  }
  const minutes = intervalMinutes();
  timer = setInterval(() => {
    void runGmailAutoSync();
  }, minutes * 60 * 1000);
  timer.unref?.();

  initialTimer = setTimeout(() => {
    void runGmailAutoSync();
  }, INITIAL_DELAY_MS);
  initialTimer.unref?.();
}

export function stopGmailAutoSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
}