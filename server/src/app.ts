import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profile";
import educationRoutes from "./routes/education";
import experienceRoutes from "./routes/experience";
import skillRoutes from "./routes/skill";
import projectRoutes from "./routes/project";
import resumeRoutes from "./routes/resume";
import githubRoutes from "./routes/github";
import professionalContentRoutes from "./routes/professionalContent";
import jobsRoutes from "./routes/jobs";
import jobMatchRoutes from "./routes/jobMatch.routes";
import applicationRoutes from "./routes/applications";
import gmailRoutes from "./routes/gmail";
import linkedinRoutes from "./routes/linkedin";
import careerIntelligenceRoutes from "./routes/careerIntelligence";
import notificationCenterRoutes from "./routes/notificationCenter";
import settingsRoutes from "./routes/settings";
import aiRoutes from "./routes/ai";
import { bootstrapJobSources } from "./integrations/jobs/bootstrap";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { NODE_ENV } from "./config";

dotenv.config();

// Register the live job sources (Adzuna, RemoteOK, Arbeitnow) at startup.
// Adzuna is only registered when its API credentials are present; the Mock
// source is excluded in production. Safe to run once at application startup.
bootstrapJobSources();

const app = express();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// Behind Render's reverse proxy req.ip is the proxy IP for every client.
// Trusting the first proxy hop restores the real client IP from
// X-Forwarded-For so per-IP rate limiting is per-user, not global.
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Sized for real SPA usage: each dashboard page view fires ~6-8
  // authenticated reads (github/status, repositories, imported, gmail/status,
  // linkedin/status, ai/providers) and an OAuth connect/disconnect cycle adds
  // a few more. 500/15min (~33 req/min sustained) leaves ample headroom for
  // repeated connect -> disconnect -> reconnect cycles while still blocking
  // genuine request floods. Keyed per real client IP (see trust proxy above).
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
// Bypass the global rate limiter in tests so large, comprehensive suites
// (auth, ownership, idempotency, etc.) can run many requests without tripping
// the 100/15min cap. Production and development behaviour is unchanged.
if (NODE_ENV !== "test") {
  app.use(limiter);
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/education", educationRoutes);
app.use("/api/experience", experienceRoutes);
app.use("/api/skills", skillRoutes);
// Register the specific /api/projects/linkedin-drafts router BEFORE the generic
// /api/projects router so the "/:id" catch-all does not swallow "linkedin-drafts".
app.use("/api/projects/linkedin-drafts", professionalContentRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/job-matches", jobMatchRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/api/linkedin", linkedinRoutes);
app.use("/api/dashboard", careerIntelligenceRoutes);
app.use("/api/notifications", notificationCenterRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/ai", aiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
