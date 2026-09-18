const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "APPLIED",
        "UNDER_REVIEW",
        "SHORTLISTED",
        "INTERVIEW",
        "OFFERED",
        "REJECTED",
        "WITHDRAWN",
      ],
      default: "APPLIED",
    },

    coverNote: {
      type: String,
      maxlength: 2000,
      default: null,
    },

    // Snapshot of the resume at the moment of applying — the applicant's
    // profile resume can change later, but the recruiter should see what
    // was actually submitted.
    resume: {
      url: { type: String, required: true },
      fileName: { type: String, default: null },
    },

    // Answers to the Job's screeningQuestions array, matched by question text.
    answers: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true },
      },
    ],

    // Recruiter-only, never shown to the applicant.
    recruiterNotes: {
      type: String,
      maxlength: 1000,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Audit trail of every status change — this is exactly what later
    // becomes the payload of your Kafka application.status_changed event,
    // and what an audit-worker would replay into AuditLog.
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    withdrawnAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// One applicant can only apply once per job.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

// "My applications" (candidate view).
applicationSchema.index({ applicant: 1, status: 1 });

applicationSchema.index({ job: 1, status: 1 });
applicationSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model("Application", applicationSchema);
