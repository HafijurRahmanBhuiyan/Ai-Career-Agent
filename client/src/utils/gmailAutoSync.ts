import api from "../api/client";
import { GmailStatus } from "../types/careerEmail";

const STALE_AFTER_MS = 60 * 1000;

let inFlight = false;

/**
 * Background Gmail refresh so the user never has to press a sync button.
 * Checks the connection status, and only actually syncs when the last sync is
 * stale (or never happened); otherwise it's a cheap no-op. Silently ignores
 * failures since this is a background convenience, not a user action.
 */
export async function triggerAutoGmailSync(): Promise<void> {
  if (inFlight) {
    return;
  }
  inFlight = true;
  try {
    const status = await api.get<GmailStatus>("/gmail/status");
    if (!status.data.connected) {
      return;
    }

    const lastSyncedAt = status.data.gmail?.lastSyncedAt;
    const stale =
      !lastSyncedAt ||
      Date.now() - new Date(lastSyncedAt).getTime() > STALE_AFTER_MS;
    if (!stale) {
      return;
    }

    await api.post("/gmail/sync");
  } catch {
    // Best-effort; swallow so it never interrupts the user's flow.
  } finally {
    inFlight = false;
  }
}