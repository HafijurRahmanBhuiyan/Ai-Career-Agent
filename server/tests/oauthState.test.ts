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

  it("should validate a valid state and return the userId", () => {
    const state = generateOAuthState("user1");
    const result = validateOAuthState(state);

    expect(result.valid).toBe(true);
    expect(result.userId).toBe("user1");
  });

  it("should fail for an invalid state", () => {
    const result = validateOAuthState("nonexistent_state");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid OAuth state");
  });

  it("should fail for a used state", () => {
    const state = generateOAuthState("user1");

    validateOAuthState(state);

    const result = validateOAuthState(state);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("OAuth state already used");
  });

  it("should clean up old states for the same user", () => {
    generateOAuthState("user1");
    generateOAuthState("user1");
    const state = generateOAuthState("user1");

    const result = validateOAuthState(state);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe("user1");
  });
});
