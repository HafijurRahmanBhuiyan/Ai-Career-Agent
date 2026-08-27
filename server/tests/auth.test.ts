import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

describe("Authentication Endpoints", () => {
  const validUser = {
    name: "Test User",
    email: "test@example.com",
    password: "securePassword123",
  };

  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send(validUser)
        .expect(201);

      expect(res.body).toHaveProperty("token");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.name).toBe(validUser.name);
      expect(res.body.user.email).toBe(validUser.email);
      expect(res.body.user.role).toBe("USER");
      expect(res.body.user.isActive).toBe(true);
      expect(res.body.user).not.toHaveProperty("passwordHash");
      expect(res.body.user).not.toHaveProperty("password");
    });

    it("should reject duplicate email registration", async () => {
      await request(app).post("/api/auth/register").send(validUser);

      const res = await request(app)
        .post("/api/auth/register")
        .send(validUser)
        .expect(409);

      expect(res.body.error).toBe("Email already registered");
    });

    it("should reject registration with missing name", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com", password: "securePassword123" })
        .expect(422);

      expect(res.body.error).toBe("Validation failed");
    });

    it("should reject registration with missing email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "Test User", password: "securePassword123" })
        .expect(422);

      expect(res.body.error).toBe("Validation failed");
    });

    it("should reject registration with short password", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "Test User", email: "test@example.com", password: "123" })
        .expect(422);

      expect(res.body.error).toBe("Validation failed");
    });

    it("should reject registration with invalid email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "Test User", email: "not-an-email", password: "securePassword123" })
        .expect(422);

      expect(res.body.error).toBe("Validation failed");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await request(app).post("/api/auth/register").send(validUser);
    });

    it("should login successfully with valid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: validUser.email, password: validUser.password })
        .expect(200);

      expect(res.body).toHaveProperty("token");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.email).toBe(validUser.email);
      expect(res.body.user).not.toHaveProperty("passwordHash");
    });

    it("should reject login with wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: validUser.email, password: "wrongpassword" })
        .expect(401);

      expect(res.body.error).toBe("Invalid email or password");
    });

    it("should reject login with non-existent email", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nonexistent@example.com", password: "somepassword" })
        .expect(401);

      expect(res.body.error).toBe("Invalid email or password");
    });

    it("should reject login with missing email", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ password: "securePassword123" })
        .expect(422);

      expect(res.body.error).toBe("Validation failed");
    });

    it("should reject login with missing password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com" })
        .expect(422);

      expect(res.body.error).toBe("Validation failed");
    });

    it("should reject login for inactive user", async () => {
      const User = (await import("../src/models/User")).default;
      await User.findOneAndUpdate(
        { email: validUser.email.toLowerCase() },
        { isActive: false }
      );

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: validUser.email, password: validUser.password })
        .expect(401);

      expect(res.body.error).toBe("Account is inactive");
    });
  });

  describe("GET /api/auth/me", () => {
    let token: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send(validUser);
      token = res.body.token;
    });

    it("should return current user with valid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.user.email).toBe(validUser.email);
      expect(res.body.user.name).toBe(validUser.name);
      expect(res.body.user).not.toHaveProperty("passwordHash");
    });

    it("should reject request without token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .expect(401);

      expect(res.body.error).toBe("No authorization header provided");
    });

    it("should reject request with invalid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalidtoken123")
        .expect(401);

      expect(res.body.error).toBe("Invalid or expired token");
    });

    it("should reject request with malformed header", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "InvalidHeader")
        .expect(401);

      expect(res.body.error).toBe("Malformed authorization header");
    });

    it("should reject request with expired token", async () => {
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        { userId: "000000000000000000000000", role: "USER" },
        process.env.JWT_SECRET,
        { expiresIn: "0s" }
      );

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body.error).toBe("Invalid or expired token");
    });

    it("should not return passwordHash in response", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.user).not.toHaveProperty("passwordHash");
      expect(res.body.user).not.toHaveProperty("password");
    });
  });
});
