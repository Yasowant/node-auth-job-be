// Optional manual RAG backfill. The server already does this automatically on
// every start (see syncAllJobEmbeddings in server.js), so you normally never
// need to run it. Useful locally:   npm run embed:jobs
require("dotenv").config();
const mongoose = require("mongoose");

const { syncAllJobEmbeddings } = require("../src/agent/jobEmbeddings");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await syncAllJobEmbeddings();
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
