import {
  generateOAuthState,
  validateOAuthState,
} from "../src/utils/oauthState";

describe("OAuth State", () => {
  it("should generate a valid state", () => {
    const state = generateOAuthState("user1");
    expect(state).toBeDefined();
    expect(typeof state).toBe("string");
    expect(state.length).toBe(64);
  });

  it("should validate a valid state", () => {
    const state = generateOAuthState("user1");
    const result = validateOAuthState(state, "user1");

    expect(result.valid).toBe(true);
  });

  it("should fail for an invalid state", () => {
    const result = validateOAuthState("nonexistent_state", "user1");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid OAuth state");
  });

  it("should fail for a used state", () => {
    const state = generateOAuthState("user1");

    validateOAuthState(state, "user1");

    const result = validateOAuthState(state, "user1");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("OAuth state already used");
  });

  it("should fail for wrong user", () => {
    const state = generateOAuthState("user1");

    const result = validateOAuthState(state, "user2");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("OAuth state does not match user");
  });

  it("should clean up old states for the same user", () => {
    generateOAuthState("user1");
    generateOAuthState("user1");
    const state = generateOAuthState("user1");

    const result = validateOAuthState(state, "user1");
    expect(result.valid).toBe(true);
  });
});
