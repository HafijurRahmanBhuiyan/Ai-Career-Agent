import request from "supertest";
import { app } from "../src/app";

export const registerUser = async (
  userData = { name: "Test User", email: "test@example.com", password: "securePassword123" }
): Promise<{ token: string; user: Record<string, unknown> }> => {
  const res = await request(app)
    .post("/api/auth/register")
    .send(userData)
    .expect(201);

  return { token: res.body.token, user: res.body.user };
};

export const registerSecondUser = async (): Promise<{ token: string; user: Record<string, unknown> }> => {
  return registerUser({
    name: "Second User",
    email: "second@example.com",
    password: "securePassword456",
  });
};
