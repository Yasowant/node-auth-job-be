const mongoose = require("mongoose");
const Job = require("../models/Jobs");
const Application = require("../models/Application");
const { buildJobQueryPlan } = require("../utils/queryPlanner");
const config = require("./config");
const User = require("../models/User");
const { embed, isEnabled: ragEnabled } = require("./embeddings");
const { JOB_VECTOR_INDEX } = require("./vectorIndex");

const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// Tells the model exactly how to recover instead of guessing again.
const INVALID_ID =
  "Invalid job id. Real ids only come from search_jobs results - call search_jobs, then use the id from its result.";

const formatLocation = (loc = {}) =>
  [loc.city, loc.state, loc.country].filter(Boolean).join(", ");

const formatSalary = (s) =>
  s?.isDisclosed
    ? { min: s.min, max: s.max, currency: s.currency, period: s.period }
    : "Not disclosed";

/** Shape every job list the same way, whichever search produced it. */
const toJobSummary = (j, company) => ({
  id: String(j._id),
  title: j.title,
  company,
  location: formatLocation(j.location),
  workMode: j.workMode,
  employmentType: j.employmentType,
  experienceYears: j.experience,
  salary: formatSalary(j.salary),
  skills: j.skills,
});

const RAG_OFF = { error: "Semantic search is not configured on this server; use search_jobs instead." };

/** RAG retrieval: nearest jobs by meaning, via Atlas Vector Search. */
const vectorSearchJobs = async (vector, { workMode, limit } = {}) => {
  const filter = { status: "ACTIVE" };
  if (workMode?.length) filter.workMode = { $in: workMode };
  const n = Math.min(Math.max(limit || 5, 1), config.maxRows);

  const jobs = await Job.aggregate([
    {
      $vectorSearch: {
        index: JOB_VECTOR_INDEX,
        path: "embedding",
        queryVector: vector,
        numCandidates: Math.max(100, n * 20), // search wide, return the best n
        limit: n,
        filter,
      },
    },
    {
      $project: {
        title: 1, company: 1, location: 1, workMode: 1, employmentType: 1,
        experience: 1, salary: 1, skills: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
    {
      $lookup: {
        from: "companies",
        localField: "company",
        foreignField: "_id",
        as: "company",
        pipeline: [{ $project: { name: 1 } }],
      },
    },
  ]);

  return jobs.map((j) => ({
    ...toJobSummary(j, j.company[0]?.name),
    // 0-1: how close the job's meaning is to the query (higher = better).
    matchScore: Math.round(j.score * 100) / 100,
  }));
};

/** The candidate's profile as text, for "match jobs to me". */
const profileToText = (user) =>
  [
    user.headline && `Headline: ${user.headline}`,
    user.skills?.length && `Skills: ${user.skills.join(", ")}`,
    user.totalExperience &&
      (user.totalExperience.years || user.totalExperience.months) &&
      `Experience: ${user.totalExperience.years} years ${user.totalExperience.months} months`,
    ...(user.experience ?? []).map(
      (e) => `Worked as ${e.designation ?? "?"} at ${e.company ?? "?"}. ${e.description ?? ""}`,
    ),
    user.bio && `About: ${user.bio}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);

// ---- What the model sees (Anthropic tool format) ---------------------------
const definitions = [
  {
    name: "search_jobs",
    description:
      "Search ACTIVE jobs on the board. Use for any request to find, list or filter jobs.",
    input_schema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Role, skill or title, e.g. 'angular developer'",
        },
        location: { type: "string", description: "City, state or country" },
        workMode: {
          type: "array",
          items: { type: "string", enum: ["REMOTE", "HYBRID", "ONSITE"] },
        },
        employmentType: {
          type: "array",
          items: {
            type: "string",
            enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"],
          },
        },
        level: {
          type: "array",
          description:
            "Experience bands: entry = 0-1 yrs, mid = 2-5 yrs, senior = 6+ yrs",
          items: { type: "string", enum: ["entry", "mid", "senior"] },
        },
        limit: {
          type: "integer",
          description: "Max results, default 5",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "semantic_search_jobs",
    description:
      "Search jobs by MEANING, not exact words (RAG over job embeddings). Use for " +
      "descriptive or vague requests, e.g. 'frontend roles for someone who knows React' " +
      "or 'jobs building dashboards for hospitals'. Use search_jobs instead for exact " +
      "filters like location, employment type or experience band.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What the user is looking for, in natural language",
        },
        workMode: {
          type: "array",
          items: { type: "string", enum: ["REMOTE", "HYBRID", "ONSITE"] },
        },
        limit: { type: "integer", description: "Max results, default 5" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "match_jobs_to_my_profile",
    description:
      "Find the jobs that best match the current user's own profile (headline, " +
      "skills, experience, bio). Use when the user asks what jobs suit them or " +
      "wants recommendations.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max results, default 5" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_job_details",
    description:
      "Full details of one job (description, requirements, screening questions).",
    input_schema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_my_applications",
    description: "The current user's applications and their statuses.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "propose_application",
    description:
      "Propose applying to a job. This does NOT apply - the user must confirm with a button.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        reason: {
          type: "string",
          description: "One sentence on why this job fits the user",
        },
      },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
];

// ---- What the server runs --------------------------------------------------
// ctx = { userId, proposals }
const handlers = {
  async search_jobs(args) {
    const limit = Math.min(Math.max(args.limit || 5, 1), config.maxRows);
    // Reuse the same planner as GET /api/jobs so search behaves identically.
    const { filter, sort } = buildJobQueryPlan({
      keyword: args.keyword,
      location: args.location,
      workMode: args.workMode,
      employmentType: args.employmentType,
      level: args.level,
      limit,
    });

    const jobs = await Job.find(filter)
      .select(
        "title company location workMode employmentType experience salary skills publishedAt",
      )
      .populate("company", "name")
      .sort(sort)
      .limit(limit)
      .lean();

    return jobs.map((j) => toJobSummary(j, j.company?.name));
  },

  async semantic_search_jobs({ query, workMode, limit }) {
    if (!ragEnabled()) return RAG_OFF;
    if (!query?.trim()) return { error: "query is required" };
    const [vector] = await embed([query.slice(0, 2000)], "query");
    return vectorSearchJobs(vector, { workMode, limit });
  },

  async match_jobs_to_my_profile({ limit }, { userId }) {
    if (!ragEnabled()) return RAG_OFF;
    const user = await User.findById(userId)
      .select("headline bio skills totalExperience experience")
      .lean();
    const profile = user ? profileToText(user) : "";
    if (!profile) {
      return {
        error:
          "The user's profile has no headline, skills or experience yet. Ask them to complete their profile first.",
      };
    }
    const [vector] = await embed([profile], "query");
    return vectorSearchJobs(vector, { limit });
  },

  async get_job_details({ jobId }) {
    if (!isId(jobId)) return { error: INVALID_ID };
    const job = await Job.findOne({ _id: jobId, status: "ACTIVE" })
      .select("-postedBy -viewCount -slug -__v")
      .populate("company", "name industry size about website")
      .lean();
    if (!job) return { error: "Job not found or no longer active" };
    return {
      ...job,
      id: String(job._id),
      location: formatLocation(job.location),
      salary: formatSalary(job.salary),
    };
  },

  async get_my_applications(_args, { userId }) {
    const apps = await Application.find({ applicant: userId })
      .select("job company status createdAt")
      .populate("job", "title")
      .populate("company", "name")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return apps.map((a) => ({
      applicationId: String(a._id),
      jobId: String(a.job?._id),
      title: a.job?.title,
      company: a.company?.name,
      status: a.status,
      appliedAt: a.createdAt,
    }));
  },

  async propose_application({ jobId, reason }, { userId, proposals }) {
    if (!isId(jobId)) return { error: INVALID_ID };
    const job = await Job.findOne({ _id: jobId, status: "ACTIVE" })
      .select("title company screeningQuestions")
      .populate("company", "name")
      .lean();
    if (!job) return { error: "Job not found or no longer active" };
    if (await Application.exists({ job: jobId, applicant: userId })) {
      return { error: "User has already applied to this job" };
    }
    if (!proposals.some((p) => p.jobId === jobId)) {
      // company + screeningQuestions let the frontend open its normal
      // ApplyModal, so required screening answers are still collected.
      proposals.push({
        type: "apply",
        jobId,
        title: job.title,
        company: job.company?.name ?? null,
        reason: reason ?? null,
        screeningQuestions: (job.screeningQuestions ?? []).map(
          ({ question, type, required }) => ({ question, type, required }),
        ),
      });
    }
    return { status: "proposed", note: "User will see a confirm button." };
  },
};

module.exports = { definitions, handlers, profileToText };
