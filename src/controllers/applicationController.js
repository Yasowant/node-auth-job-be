const Application = require("../models/Application");
const Job = require("../models/Jobs");
const User = require("../models/User");
const { publishEvent } = require("../events/producers");
const TOPICS = require("../events/topics");

const applyToJob = async (req, res, next) => {
  try {
    const { jobId, coverNote, answers } = req.body;

    if (!jobId) {
      return res.status(400).json({
        message: "jobId is required",
      });
    }

    const job = await Job.findById(jobId);

    if (!job || job.status !== "ACTIVE") {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    const user = await User.findById(req.user.userId).select("resume");

    if (!user.resume || !user.resume.url) {
      return res.status(400).json({
        message: "Upload a resume to your profile before applying",
      });
    }

    const alreadyApplied = await Application.findOne({
      job: job._id,
      applicant: req.user.userId,
    });

    if (alreadyApplied) {
      return res.status(409).json({
        message: "You have already applied to this job",
      });
    }

    const application = await Application.create({
      job: job._id,
      applicant: req.user.userId,
      company: job.company,
      coverNote,
      answers,
      resume: {
        url: user.resume.url,
        fileName: user.resume.fileName,
      },
      statusHistory: [{ status: "APPLIED", changedBy: req.user.userId }],
    });

    await publishEvent(
      TOPICS.APPLICATION_EVENTS,
      {
        type: "application.created",
        applicationId: application._id,
        jobId: job._id,
        applicantId: req.user.userId,
        companyId: job.company,
        createdAt: application.createdAt,
      },
      application._id,
    );

    // Keep the on-job counter in sync without blocking the response.
    Job.updateOne({ _id: job._id }, { $inc: { applicantCount: 1 } }).catch(
      () => {},
    );

    return res.status(201).json({
      message: "Application submitted successfully",
      application,
    });
  } catch (error) {
    // Guards against a race on the unique { job, applicant } index.
    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already applied to this job",
      });
    }

    next(error);
  }
};

const getMyApplications = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const filter = { applicant: req.user.userId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate("job", "title slug status")
        .populate("company", "name logo")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Application.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "Application fetched successfully",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      applications,
    });
  } catch (error) {
    next(error);
  }
};

const getApplicantsForJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    if (job.postedBy.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only view applicants for your own jobs",
      });
    }

    const filter = { job: job._id };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const applications = await Application.find(filter)
      .populate("applicant", "name email skills headline resume")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Applicants fetched successfully",
      count: applications.length,
      applications,
    });
  } catch (error) {
    next(error);
  }
};

const ALLOWED_STATUSES = [
  "UNDER_REVIEW",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFERED",
  "REJECTED",
];

const updateApplicationStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
      });
    }

    const application = await Application.findById(req.params.id).populate(
      "job",
      "postedBy",
    );

    if (!application) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    if (application.job.postedBy.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only update applications for your own jobs",
      });
    }

    application.status = status;
    application.reviewedBy = req.user.userId;

    if (note !== undefined) {
      application.recruiterNotes = note;
    }

    application.statusHistory.push({
      status,
      changedBy: req.user.userId,
    });

    await application.save();

    await publishEvent(
      TOPICS.APPLICATION_EVENTS,
      {
        type: "application.status_changed",
        applicationId: application._id,
        jobId: application.job._id,
        applicantId: application.applicant,
        companyId: application.company,
        status,
        changedBy: req.user.userId,
        changedAt: new Date(),
      },
      application._id,
    );

    return res.status(200).json({
      message: "Application status updated successfully",
      application,
    });
  } catch (error) {
    next(error);
  }
};

const withdrawApplication = async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    if (application.applicant.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only withdraw your own applications",
      });
    }

    if (application.status === "WITHDRAWN") {
      return res.status(400).json({
        message: "Application is already withdrawn",
      });
    }

    application.status = "WITHDRAWN";
    application.withdrawnAt = new Date();
    application.statusHistory.push({
      status: "WITHDRAWN",
      changedBy: req.user.userId,
    });

    await application.save();

    await publishEvent(
      TOPICS.APPLICATION_EVENTS,
      {
        type: "application.status_changed",
        applicationId: application._id,
        jobId: application.job,
        applicantId: application.applicant,
        companyId: application.company,
        status: "WITHDRAWN",
        changedBy: req.user.userId,
        changedAt: new Date(),
      },
      application._id,
    );

    return res.status(200).json({
      message: "Application withdrawn successfully",
      application,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyToJob,
  getMyApplications,
  getApplicantsForJob,
  updateApplicationStatus,
  withdrawApplication,
};
