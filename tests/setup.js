const mongoose = require("mongoose");
const os = require("os");
const path = require("path");

// Secrets must exist before any module that reads them is required.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test_access_secret_do_not_use_in_production";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret_do_not_use_in_production";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.REFRESH_TOKEN_EXPIRES_IN = "7d";
// Keep downloaded MongoDB binaries in a writable temporary location when the
// test process is sandboxed (rather than in the user's home-directory cache).
process.env.MONGOMS_DOWNLOAD_DIR = path.join(
  os.tmpdir(),
  "node-auth-mongodb-binaries",
);

let memoryServer;

beforeAll(async () => {
  // CI (and anyone with a local Mongo) points MONGO_URI_TEST at a real server.
  // Otherwise fall back to an in-memory Mongo, which downloads a binary on
  // first use and therefore needs outbound network access.
  let uri = process.env.MONGO_URI_TEST;

  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");

    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
});

afterEach(async () => {
  const { collections } = mongoose.connection;

  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }

  await mongoose.connection.close();

  if (memoryServer) {
    await memoryServer.stop();
  }
});
