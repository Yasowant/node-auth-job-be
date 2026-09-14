const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true,
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    responsibilities: [
      {
        type: String,
        trim: true,
      },
    ],

    requirements: [
      {
        type: String,
        trim: true,
      },
    ],

    category: {
      type: String,
      trim: true,
    },

    skills: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    location: {
      city: {
        type: String,
        trim: true,
      },

      state: {
        type: String,
        trim: true,
      },

      country: {
        type: String,
        trim: true,
      },
    },

    workMode: {
      type: String,
      enum: ["REMOTE", "HYBRID", "ONSITE"],
    },

    employmentType: {
      type: String,
      enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"],
    },

    experience: {
      min: {
        type: Number,
        min: 0,
      },

      max: {
        type: Number,
        min: 0,
      },
    },

    salary: {
      min: {
        type: Number,
        min: 0,
      },

      max: {
        type: Number,
        min: 0,
      },

      currency: {
        type: String,
      },

      period: {
        type: String,
      },

      isDisclosed: {
        type: Boolean,
        default: false,
      },
    },

    openings: {
      type: Number,
      default: 1,
      min: 1,
    },

    screeningQuestions: [
      {
        question: {
          type: String,
          required: true,
        },

        type: {
          type: String,
          required: true,
        },

        required: {
          type: Boolean,
          default: false,
        },
      },
    ],

    status: {
      type: String,
      enum: [
        "DRAFT",
        "PENDING_REVIEW",
        "ACTIVE",
        "PAUSED",
        "CLOSED",
        "EXPIRED",
      ],
      default: "DRAFT",
    },

    applicantCount: {
      type: Number,
      default: 0,
    },

    viewCount: {
      type: Number,
      default: 0,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes

jobSchema.index({
  title: "text",
  description: "text",
  skills: "text",
});

jobSchema.index({
  status: 1,
  publishedAt: -1,
});

jobSchema.index({
  status: 1,
  workMode: 1,
  employmentType: 1,
});

jobSchema.index({
  company: 1,
  status: 1,
});

jobSchema.index({
  slug: 1,
  unique: true,
});

jobSchema.index({
  expiresAt: 1,
});

module.exports = mongoose.model("Job", jobSchema);
