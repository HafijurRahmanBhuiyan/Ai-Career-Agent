export const TOKEN_STORAGE_KEY = "career_agent_token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    sessionStorage.clear();
  }
}
