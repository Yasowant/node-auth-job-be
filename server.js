require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/db");
const { disconnectDB } = require("./src/config/db");
const {
  connectProducer,
  disconnectProducer,
} = require("./src/events/producers");

const PORT = process.env.PORT || 4000;

let server;

const startServer = async () => {
  try {
    await connectDB();
    await connectProducer();

    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use.`);
      } else {
        console.error("Server error:", error.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("Server startup aborted:", error.message);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectProducer();
  await disconnectDB();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

startServer();
