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
import jobsRoutes from "./routes/jobs";
import jobMatchRoutes from "./routes/jobMatch.routes";
import applicationRoutes from "./routes/applications";
import gmailRoutes from "./routes/gmail";
import careerIntelligenceRoutes from "./routes/careerIntelligence";
import { registerJobSource } from "./integrations/jobs/jobSourceRegistry";
import { MockJobSource } from "./integrations/jobs/sources/mockJobSource";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { NODE_ENV } from "./config";

registerJobSource(() => new MockJobSource());

dotenv.config();

const app = express();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(helmet());

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
app.use("/api/projects", projectRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/job-matches", jobMatchRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/api/dashboard", careerIntelligenceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
