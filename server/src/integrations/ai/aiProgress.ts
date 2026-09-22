import { AsyncLocalStorage } from "async_hooks";
import { AIProvider } from "./ai.types";
import { AiFailureCategory } from "./aiErrorClassifier";

/**
 * Live progress events published by the AI router while a request is running.
 * The client opens an SSE stream keyed by the same `requestId` it sends in the
 * POST body, so the result cards can show the exact provider + model being
 * attempted in real time (including provider/model-level fallbacks).
 */
export interface AIProgressEvent {
  provider: AIProvider | "";
  model: string;
  status: "trying" | "failed" | "finished";
  category?: AiFailureCategory;
  message?: string;
}

export interface AIAttemptResult {
  provider: AIProvider;
  model: string;
}

interface AIProgressStore {
  requestId?: string;
  lastAiAttempt?: AIAttemptResult;
}

const als = new AsyncLocalStorage<AIProgressStore>();

const listeners = new Map<string, Set<(event: AIProgressEvent) => void>>();

const lastAttempts = new Map<string, AIAttemptResult>();

const MAX_SUBSCRIBERS_PER_REQUEST = 50;

export function getCurrentRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

/**
 * Record the provider + model that actually produced a successful response.
 * Called by the AI router right after a provider call succeeds; because the
 * call runs inside the request scope, it lands on the request's store.
 */
export function setLastAiAttempt(attempt: AIAttemptResult): void {
  const store = als.getStore();
  if (store) {
    store.lastAiAttempt = attempt;
  }
}

/**
 * Read (and forget) the final provider + model used by the most recently
 * completed AI request. Controllers call this after runAiRequest() resolves to
 * tell the client exactly which model generated the result.
 */
export function consumeAiAttempt(requestId: string): AIAttemptResult | null {
  if (!requestId) {
    return null;
  }
  const attempt = lastAttempts.get(requestId);
  if (attempt) {
    lastAttempts.delete(requestId);
  }
  return attempt ?? null;
}

/**
 * Run a task with a request-scoped context so publishAiProgress() can route
 * events to the correct SSE stream without threading a callback through every
 * service layer. A "finished" event is always published (success or failure)
 * so the SSE stream can close once the POST settles. On success the resolved
 * provider/model is stashed under the requestId for consumeAiAttempt().
 */
export async function runAiRequest<T>(
  requestId: string | undefined,
  task: () => Promise<T>
): Promise<T> {
  return als.run({ requestId }, async () => {
    try {
      const value = await task();
      if (requestId) {
        const attempt = als.getStore()?.lastAiAttempt;
        if (attempt) {
          lastAttempts.set(requestId, attempt);
        }
      }
      return value;
    } finally {
      if (requestId) {
        publishAiProgress({ provider: "", model: "", status: "finished" });
      }
    }
  });
}

/**
 * Express middleware that guarantees every HTTP request has an ALS store so
 * publishAiProgress() (and any future request-scoped readers) never hit an
 * undefined store.
 */
export function requestContextMiddleware(
  _req: unknown,
  _res: unknown,
  next: () => void
): void {
  als.run({}, () => next());
}

export function publishAiProgress(event: AIProgressEvent): void {
  const requestId = als.getStore()?.requestId;
  if (!requestId) {
    return;
  }

  const set = listeners.get(requestId);
  if (!set || set.size === 0) {
    return;
  }

  for (const handler of [...set]) {
    try {
      handler(event);
    } catch {
      // A slow or disconnected SSE client must never break the AI call.
    }
  }

  if (set.size === 0) {
    listeners.delete(requestId);
  }
}

export function subscribeAiProgress(
  requestId: string,
  handler: (event: AIProgressEvent) => void
): () => void {
  let set = listeners.get(requestId);
  if (!set) {
    set = new Set();
    listeners.set(requestId, set);
  }
  set.add(handler);

  if (set.size > MAX_SUBSCRIBERS_PER_REQUEST) {
    const oldest = set.values().next().value;
    if (typeof oldest === "function") {
      set.delete(oldest as (event: AIProgressEvent) => void);
    }
  }

  return () => {
    const current = listeners.get(requestId);
    if (!current) {
      return;
    }
    current.delete(handler);
    if (current.size === 0) {
      listeners.delete(requestId);
    }
  };
}

export function parseRequestId(
  body: Record<string, unknown> | undefined
): string {
  if (body && typeof body.requestId === "string" && body.requestId.trim()) {
    return body.requestId.trim();
  }
  return "";
}