const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error(
      "MONGO_URI is not set. Add it to your .env file (e.g. mongodb://127.0.0.1:27017/node_auth)",
    );
  }

  mongoose.set("strictQuery", true);

  // Log connection state changes so a drop after startup is visible.
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("MongoDB reconnected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB runtime error:", err.message);
  });

  try {
    const conn = await mongoose.connect(uri, {
      // Fail fast instead of hanging for the 30s default.
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(
      `MongoDB connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`,
    );

    return conn;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    if (/ECONNREFUSED/.test(error.message)) {
      console.error(
        "\nNothing is listening on that address. If you are using a local MongoDB, start it first:\n" +
          "  brew services start mongodb-community\n" +
          "  # or: docker run -d --name mongo -p 27017:27017 mongo:7\n",
      );
    }

    throw error;
  }
};

const disconnectDB = async () => {
  await mongoose.connection.close();
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
