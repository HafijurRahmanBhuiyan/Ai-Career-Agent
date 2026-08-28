const DEFAULT_TIMEOUT_MS = 15000;

export class HttpFetchError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HttpFetchError";
    this.status = status;
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new HttpFetchError(message);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new HttpFetchError(
      `HTTP ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpFetchError("Invalid JSON in job source response");
  }
}
