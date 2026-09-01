/**
 * Client-side canonical handoff-URL validator. Mirrors the server validator in
 * server/src/services/applyCapability.ts. Accepts ONLY http/https URLs that
 * parse with `new URL()` and carry a real hostname. Returns the trimmed URL
 * when valid, otherwise null. Every external open in the client must pass
 * through this helper (defense in depth on top of the server validation).
 */
export function validateHandoffUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;

  return trimmed;
}