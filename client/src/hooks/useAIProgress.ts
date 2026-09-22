import { useEffect, useState } from "react";
import { getToken } from "../utils/tokenStorage";

/**
 * Live provider + model currently being used by a running AI request.
 * streamed from the server through the /api/ai/progress/:requestId SSE
 * endpoint (mirrors server/src/integrations/ai/aiProgress.ts).
 */
export interface AIProgressState {
  provider: string;
  model: string;
}

export function genRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildProgressUrl(requestId: string): string {
  const base = (
    import.meta.env.VITE_API_URL as string | undefined
  )?.replace(/\/$/, "");
  return `${base || "/api"}/ai/progress/${encodeURIComponent(requestId)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Opens an SSE stream (via fetch so the JWT can be sent as a header) for the
 * given requestId and reports the latest `{ provider, model }` attempt. Keeps
 * reconnecting while enabled so transient network hiccups don't drop the
 * live indicator; stops as soon as the server publishes "finished".
 */
export function useAIProgress(
  requestId: string,
  enabled = true
): AIProgressState | null {
  const [current, setCurrent] = useState<AIProgressState | null>(null);

  useEffect(() => {
    if (!enabled || !requestId) {
      setCurrent(null);
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;
    let delayMs = 500;

    const run = async () => {
      while (!cancelled) {
        controller = new AbortController();
        const token = getToken();
        let res: Response;

        try {
          res = await fetch(buildProgressUrl(requestId), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            await sleep(Math.min(delayMs, 4000));
            delayMs = Math.min(delayMs * 1.5, 4000);
            continue;
          }
          delayMs = 500;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });

            let lineEnd;
            while ((lineEnd = buffer.indexOf("\n")) !== -1) {
              const rawLine = buffer.slice(0, lineEnd).trim();
              buffer = buffer.slice(lineEnd + 1);
              if (!rawLine || rawLine.startsWith(":")) {
                continue;
              }
              const colonIndex = rawLine.indexOf(":");
              if (colonIndex === -1) {
                continue;
              }
              const field = rawLine.slice(0, colonIndex);
              if (field !== "data") {
                continue;
              }
              try {
                const payload = JSON.parse(rawLine.slice(colonIndex + 1).trim());
                if (payload?.status === "finished") {
                  return;
                }
                if (payload?.provider && payload?.model) {
                  setCurrent({
                    provider: payload.provider,
                    model: payload.model,
                  });
                }
              } catch {
                // ignore malformed frames
              }
            }
          }
        } catch (err) {
          if (cancelled) {
            return;
          }
          const aborted =
            (err as Error | undefined)?.name === "AbortError";
          if (!aborted) {
            await sleep(Math.min(delayMs, 4000));
            delayMs = Math.min(delayMs * 1.5, 4000);
          }
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controller?.abort();
      setCurrent(null);
    };
  }, [requestId, enabled]);

  return current;
}