const Job = require("../models/Jobs");
const { DIM } = require("./embeddings");

// Atlas Vector Search index over Job.embedding. The filter fields let a
// search be restricted to ACTIVE (and optionally REMOTE/HYBRID/...) jobs.
const JOB_VECTOR_INDEX = "job_embedding_index";

const definition = {
  fields: [
    { type: "vector", path: "embedding", numDimensions: DIM, similarity: "cosine" },
    { type: "filter", path: "status" },
    { type: "filter", path: "workMode" },
  ],
};

/**
 * Creates the index if it does not exist (Atlas only - needs MongoDB 6.0.11+
 * / 7.0.2+, works on the free M0 tier). Returns the index status.
 */
const ensureJobVectorIndex = async () => {
  const collection = Job.collection;
  const existing = await collection.listSearchIndexes(JOB_VECTOR_INDEX).toArray();

  if (existing.length === 0) {
    await collection.createSearchIndex({
      name: JOB_VECTOR_INDEX,
      type: "vectorSearch",
      definition,
    });
    return "CREATED (building - takes ~1 minute before it can be queried)";
  }

  return existing[0].status || "EXISTS";
};

module.exports = { JOB_VECTOR_INDEX, ensureJobVectorIndex };
