import axios from "axios";
import { getToken, clearToken } from "../utils/tokenStorage";

export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let verifyingSession = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status: number | undefined = error?.response?.status;
    const url: string = error?.config?.url || "";

    const isAuthEndpoint =
      url.includes("/auth/login") || url.includes("/auth/register");

    if (status === 401 && getToken() && !verifyingSession && !isAuthEndpoint) {
      // A 401 here usually means the app-session token is invalid, but several
      // endpoints also return 401 when a *connected provider's* credentials are
      // broken (Gmail/GitHub/LinkedIn integrations). Logging the user out on
      // those would terminate a perfectly valid session for an unrelated
      // reason. Before tearing the session down, check whether the session
      // token itself is actually rejected by an auth-protected endpoint; only
      // then clear the session.
      verifyingSession = true;
      let sessionValid = false;
      try {
        await api.get("/auth/me");
        sessionValid = true;
      } catch (checkError: unknown) {
        sessionValid =
          (checkError as { response?: { status?: number } })?.response
            ?.status !== 401;
      } finally {
        verifyingSession = false;
      }

      if (!sessionValid) {
        clearToken();
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
      }
    }

    return Promise.reject(error);
  }
);

export default api;
