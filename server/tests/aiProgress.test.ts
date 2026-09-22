import {
  getCurrentRequestId,
  parseRequestId,
  publishAiProgress,
  runAiRequest,
  subscribeAiProgress,
} from "../src/integrations/ai/aiProgress";

describe("aiProgress (SSE provider/model events)", () => {
  it("does not route events published outside a request scope", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeAiProgress("req-outside", (e) =>
      received.push(e)
    );

    publishAiProgress({ provider: "gemini", model: "gemini-3.8-flash", status: "trying" });

    expect(received).toHaveLength(0);
    unsubscribe();
  });

  it("routes events published inside runAiRequest to that requestId", async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeAiProgress("req-abc", (e) =>
      received.push(e)
    );

    await runAiRequest("req-abc", () => {
      publishAiProgress({ provider: "gemini", model: "gemini-3.8-flash", status: "trying" });
      publishAiProgress({
        provider: "gemini",
        model: "gemini-3.8-flash",
        status: "failed",
        category: "rate_limited",
      });
      return Promise.resolve();
    });

    expect(received.map((e) => (e as { status: string }).status)).toEqual([
      "trying",
      "failed",
      "finished",
    ]);
    unsubscribe();
  });

  it("does not publish events when requestId is empty", async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeAiProgress("req-empty", (e) => received.push(e));

    await runAiRequest("", () => {
      publishAiProgress({ provider: "groq", model: "openai/gpt-oss-120b", status: "trying" });
      return Promise.resolve();
    });

    expect(received).toHaveLength(0);
    unsubscribe();
  });

  it("propagates results and exposes the requestId via getCurrentRequestId", async () => {
    let seenId: string | undefined;
    const result = await runAiRequest("req-xyz", () => {
      seenId = getCurrentRequestId();
      return Promise.resolve(42);
    });

    expect(seenId).toBe("req-xyz");
    expect(result).toBe(42);
    expect(getCurrentRequestId()).toBeUndefined();
  });

  it("stops delivering after unsubscribe", async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeAiProgress("req-unsub", (e) => received.push(e));
    unsubscribe();

    await runAiRequest("req-unsub", () => {
      publishAiProgress({ provider: "openai", model: "gpt-4o-mini", status: "trying" });
      return Promise.resolve();
    });

    expect(received).toHaveLength(0);
  });

  it("parses a requestId from a request body", () => {
    expect(parseRequestId({ requestId: "abc-123" })).toBe("abc-123");
    expect(parseRequestId({ requestId: "  " })).toBe("");
    expect(parseRequestId({ requestId: 7 })).toBe("");
    expect(parseRequestId(undefined)).toBe("");
    expect(parseRequestId({ foo: "bar" })).toBe("");
  });
});