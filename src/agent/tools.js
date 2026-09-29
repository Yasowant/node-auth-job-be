const mongoose = require("mongoose");
const Job = require("../models/Jobs");
const Application = require("../models/Application");
const { buildJobQueryPlan } = require("../utils/queryPlanner");
const config = require("./config");

const isId = (id) => mongoose.Types.ObjectId.isValid(id);

const formatLocation = (loc = {}) =>
  [loc.city, loc.state, loc.country].filter(Boolean).join(", ");

const formatSalary = (s) =>
  s?.isDisclosed
    ? { min: s.min, max: s.max, currency: s.currency, period: s.period }
    : "Not disclosed";

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

    return jobs.map((j) => ({
      id: String(j._id),
      title: j.title,
      company: j.company?.name,
      location: formatLocation(j.location),
      workMode: j.workMode,
      employmentType: j.employmentType,
      experienceYears: j.experience,
      salary: formatSalary(j.salary),
      skills: j.skills,
    }));
  },

  async get_job_details({ jobId }) {
    if (!isId(jobId)) return { error: "Invalid job id" };
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
    if (!isId(jobId)) return { error: "Invalid job id" };
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

module.exports = { definitions, handlers };
