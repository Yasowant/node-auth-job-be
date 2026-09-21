require("dotenv").config();

const app = require("./src/app");

const { connectDB, disconnectDB } = require("./src/config/db");

const { connectRedis, disconnectRedis } = require("./src/config/redis");

const {
  connectProducer,
  disconnectProducer,
} = require("./src/events/producers");

const PORT = process.env.PORT || 4000;

let server;

const startServer = async () => {
  try {
    // 1. Connect MongoDB
    await connectDB();

    // 2. Connect Redis
    await connectRedis();

    // 3. Connect Kafka Producer
    await connectProducer();

    // 4. Start Express Server
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

    // Clean up any services that connected
    // before a later connection failed.
    await disconnectRedis().catch(() => {});
    await disconnectProducer().catch(() => {});
    await disconnectDB().catch(() => {});

    process.exit(1);
  }
};

const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);

  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }

  await disconnectProducer();
  await disconnectRedis();
  await disconnectDB();

  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);

  // Production applications should also ensure
  // connections are closed before exiting.
  process.exit(1);
});

startServer();
