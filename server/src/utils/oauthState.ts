import crypto from "crypto";

interface OAuthState {
  userId: string;
  createdAt: number;
  used: boolean;
}

const stateStore = new Map<string, OAuthState>();
const STATE_EXPIRY_MS = 10 * 60 * 1000;

export function generateOAuthState(userId: string): string {
  const state = crypto.randomBytes(32).toString("hex");

  stateStore.forEach((value, key) => {
    if (value.userId === userId) {
      stateStore.delete(key);
    }
  });

  stateStore.set(state, {
    userId,
    createdAt: Date.now(),
    used: false,
  });

  cleanupExpiredStates();

  return state;
}

export function validateOAuthState(
  state: string
): { valid: boolean; userId?: string; error?: string } {
  const stored = stateStore.get(state);

  if (!stored) {
    return { valid: false, error: "Invalid OAuth state" };
  }

  if (stored.used) {
    stateStore.delete(state);
    return { valid: false, error: "OAuth state already used" };
  }

  if (Date.now() - stored.createdAt > STATE_EXPIRY_MS) {
    stateStore.delete(state);
    return { valid: false, error: "OAuth state expired" };
  }

  stored.used = true;

  return {
    valid: true,
    userId: stored.userId,
  };
}

function cleanupExpiredStates(): void {
  const now = Date.now();
  stateStore.forEach((value, key) => {
    if (now - value.createdAt > STATE_EXPIRY_MS) {
      stateStore.delete(key);
    }
  });
}
