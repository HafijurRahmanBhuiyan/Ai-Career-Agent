import { app, PORT } from "./app";

const server = app.listen(PORT, () => {
  console.log(`🚀 AI Career Agent API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});

process.on("unhandledRejection", (err: Error) => {
  console.error("UNHANDLED REJECTION:", err.message);
  server.close(() => process.exit(1));
});

process.on("uncaughtException", (err: Error) => {
  console.error("UNCAUGHT EXCEPTION:", err.message);
  server.close(() => process.exit(1));
});
