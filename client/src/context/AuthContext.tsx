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
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (credentials: LoginRequest) => {
    const res = await authService.login(credentials);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
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
