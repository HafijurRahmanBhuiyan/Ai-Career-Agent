import { app } from "./app";
import { connectDatabase } from "./config/database";
import { PORT } from "./config";

const start = async () => {
  try {
    await connectDatabase();

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
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
