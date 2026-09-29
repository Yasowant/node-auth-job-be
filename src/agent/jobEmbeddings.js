const crypto = require("crypto");
const Job = require("../models/Jobs");
const { embed, isEnabled } = require("./embeddings");

/** The text that represents a job's "meaning". */
const jobToText = (job) =>
  [
    `Title: ${job.title}`,
    job.category && `Category: ${job.category}`,
    job.skills?.length && `Skills: ${job.skills.join(", ")}`,
    job.workMode && `Work mode: ${job.workMode}`,
    job.employmentType && `Type: ${job.employmentType}`,
    job.experience &&
      `Experience: ${job.experience.min ?? 0}-${job.experience.max ?? "?"} years`,
    `Description: ${job.description}`,
    job.requirements?.length && `Requirements: ${job.requirements.join("; ")}`,
    job.responsibilities?.length &&
      `Responsibilities: ${job.responsibilities.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);

/** Embed one job and save it. Safe to call after every create/update. */
const refreshJobEmbedding = async (jobId) => {
  if (!isEnabled()) return;

  const job = await Job.findById(jobId).select("+embeddingHash").lean();
  if (!job) return;

  const text = jobToText(job);
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  if (hash === job.embeddingHash) return; // unchanged - save API calls

  const [vector] = await embed([text], "document");
  await Job.updateOne(
    { _id: jobId },
    { $set: { embedding: vector, embeddingHash: hash } },
  );
};

/**
 * Production-safe background sync, run on server start:
 *  1. make sure the Atlas vector index exists
 *  2. embed any job that has no vector yet or whose text changed
 * Never throws - RAG is an optional feature; the API must boot without it.
 */
const syncAllJobEmbeddings = async () => {
  if (!isEnabled()) {
    console.log("[rag] VOYAGE_API_KEY not set - semantic search disabled");
    return;
  }

  // Required lazily to avoid a circular import (vectorIndex -> embeddings).
  const { ensureJobVectorIndex } = require("./vectorIndex");

  try {
    console.log("[rag] vector index:", await ensureJobVectorIndex());
  } catch (err) {
    console.warn("[rag] could not ensure vector index:", err.message);
  }

  const jobs = await Job.find({}).select("_id").lean();
  let failed = 0;
  for (const job of jobs) {
    try {
      await refreshJobEmbedding(job._id); // skips unchanged jobs (hash)
    } catch (err) {
      failed += 1;
      console.warn("[rag] embedding failed for job", String(job._id), "-", err.message);
    }
  }
  console.log(`[rag] embeddings in sync: ${jobs.length - failed}/${jobs.length} jobs`);
};

module.exports = { refreshJobEmbedding, syncAllJobEmbeddings, jobToText };
