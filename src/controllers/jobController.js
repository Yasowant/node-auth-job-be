const crypto = require("crypto");

const Job = require("../models/Jobs");
const Company = require("../models/Company");

/**
 * Build a URL-safe slug from a title, with a short random suffix so two
 * recruiters posting "Backend Engineer" do not collide on the unique index.
 */
const buildSlug = (title) => {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
};

// ======================================================
// CREATE JOB  (RECRUITER)
// ======================================================

const createJob = async (req, res, next) => {
  try {
    const {
      title,
      description,
      responsibilities,
      requirements,
      category,
      skills,
      location,
      workMode,
      employmentType,
      experience,
      salary,
      openings,
      screeningQuestions,
      status,
      expiresAt,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        message: "Title and description are required",
      });
    }

    // A recruiter may only post against the company they own.
    const company = await Company.findOne({ owner: req.user.userId });

    if (!company) {
      return res.status(400).json({
        message: "Create a company before posting a job",
      });
    }

    const publish = status === "ACTIVE";

    const job = await Job.create({
      title,
      slug: buildSlug(title),
      company: company._id,
      postedBy: req.user.userId,
      description,
      responsibilities,
      requirements,
      category,
      skills,
      location,
      workMode,
      employmentType,
      experience,
      salary,
      openings,
      screeningQuestions,
      status: status || "DRAFT",
      publishedAt: publish ? new Date() : null,
      expiresAt: expiresAt || null,
    });

    return res.status(201).json({
      message: "Job created successfully",
      job,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET ALL JOBS  (PUBLIC - active jobs only)
// ======================================================

const getAllJobs = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const filter = { status: "ACTIVE" };

    if (req.query.workMode) {
      filter.workMode = req.query.workMode;
    }

    if (req.query.employmentType) {
      filter.employmentType = req.query.employmentType;
    }

    if (req.query.q) {
      filter.$text = { $search: req.query.q };
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("company", "name logo verified")
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Job.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "Jobs fetched successfully",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      jobs,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET JOB BY ID  (PUBLIC)
// ======================================================

const getJobById = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("company", "name logo website verified")
      .populate("postedBy", "name");

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    const postedById = job.postedBy._id || job.postedBy;
    const isOwner = req.user && postedById.toString() === req.user.userId;
    const isAdmin = req.user && req.user.role === "ADMIN";

    // Anonymous visitors may only read public listings. Recruiters can still
    // inspect their own drafts; admins can moderate every listing.
    if (job.status !== "ACTIVE" && !isOwner && !isAdmin) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Count the view without waiting on it or racing the response.
    Job.updateOne({ _id: job._id }, { $inc: { viewCount: 1 } }).catch(() => {});

    return res.status(200).json({
      message: "Job fetched successfully",
      job,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET MY JOBS  (RECRUITER - every status)
// ======================================================

const getMyJobs = async (req, res, next) => {
  try {
    const jobs = await Job.find({ postedBy: req.user.userId })
      .populate("company", "name logo")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Jobs fetched successfully",
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// UPDATE JOB  (RECRUITER - owner only)
// ======================================================

const UPDATABLE_FIELDS = [
  "title",
  "description",
  "responsibilities",
  "requirements",
  "category",
  "skills",
  "location",
  "workMode",
  "employmentType",
  "experience",
  "salary",
  "openings",
  "screeningQuestions",
  "expiresAt",
];

const updateJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    // A recruiter may only touch their own postings.
    if (job.postedBy.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only edit your own jobs",
      });
    }

    for (const field of UPDATABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        job[field] = req.body[field];
      }
    }

    // Stamp publishedAt the first time a job goes live.
    if (req.body.status !== undefined) {
      if (req.body.status === "ACTIVE" && !job.publishedAt) {
        job.publishedAt = new Date();
      }

      job.status = req.body.status;
    }

    await job.save();

    return res.status(200).json({
      message: "Job updated successfully",
      job,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// DELETE JOB  (RECRUITER - owner only)
// ======================================================

const deleteJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    if (job.postedBy.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only delete your own jobs",
      });
    }

    await job.deleteOne();

    return res.status(200).json({
      message: "Job deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createJob,
  getAllJobs,
  getJobById,
  getMyJobs,
  updateJob,
  deleteJob,
};
