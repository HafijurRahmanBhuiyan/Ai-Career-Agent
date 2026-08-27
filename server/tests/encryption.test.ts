import {
  encryptToken,
  decryptToken,
  generateEncryptionKey,
} from "../src/utils/encryption";

beforeAll(() => {
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = generateEncryptionKey();
});

describe("Token Encryption", () => {
  it("should encrypt and decrypt a token", () => {
    const originalToken = "gho_test_token_abc123";

    const encrypted = encryptToken(originalToken);
    expect(encrypted).not.toBe(originalToken);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it("should produce different encrypted values for the same token", () => {
    const token = "gho_same_token";

    const encrypted1 = encryptToken(token);
    const encrypted2 = encryptToken(token);

    expect(encrypted1).not.toBe(encrypted2);

    expect(decryptToken(encrypted1)).toBe(token);
    expect(decryptToken(encrypted2)).toBe(token);
  });

  it("should fail to decrypt with wrong key", () => {
    const token = "gho_protected_token";
    const encrypted = encryptToken(token);

    const originalKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = generateEncryptionKey();

    expect(() => decryptToken(encrypted)).toThrow();

    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("should fail to decrypt invalid format", () => {
    expect(() => decryptToken("invalid")).toThrow("Invalid encrypted token format");
    expect(() => decryptToken("abc:def")).toThrow("Invalid encrypted token format");
  });

  it("should generate a valid encryption key", () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
  });

  it("should fail if encryption key is not set", () => {
    const originalKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptToken("token")).toThrow("GITHUB_TOKEN_ENCRYPTION_KEY is not defined");

    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = originalKey;
  });
});
