import api from "../api/client";
import {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from "../types/auth";

export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/login", credentials);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/register", data);
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await api.get<{ user: User }>("/auth/me");
  return res.data.user;
}
