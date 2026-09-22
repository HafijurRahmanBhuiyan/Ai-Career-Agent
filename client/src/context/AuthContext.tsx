import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { getToken, setToken, clearToken } from "../utils/tokenStorage";
import * as authService from "../services/auth";
import { triggerAutoGmailSync } from "../utils/gmailAutoSync";
import { AUTH_UNAUTHORIZED_EVENT } from "../api/client";
import { User, LoginRequest, RegisterRequest } from "../types/auth";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearSession = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () =>
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [handleUnauthorized]);

  const refreshUser = useCallback(async () => {
    const storedToken = getToken();
    if (!storedToken) {
      setIsLoading(false);
      return;
    }
    setTokenState(storedToken);
    try {
      const me = await authService.getMe();
      setUser(me);
      // Session restored (e.g. page refresh): pull fresh career emails in the
      // background so the Mail/Career Emails sections are up to date.
      void triggerAutoGmailSync();
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    // Keep career emails detected continuously while the app is open on any
    // page: check for new mail every minute in the background. The sync
    // itself is stale-gated, so this stays cheap when nothing has changed.
    const intervalId = window.setInterval(() => {
      void triggerAutoGmailSync();
    }, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [token]);

  const login = useCallback(async (credentials: LoginRequest) => {
    const res = await authService.login(credentials);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    // Auto-fetch career emails right after login — no manual sync needed.
    void triggerAutoGmailSync();
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    const res = await authService.register(data);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
