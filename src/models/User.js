const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      enum: ["USER", "RECRUITER", "ADMIN"],
      default: "USER",
    },

    workStatus: {
      type: String,
      enum: ["EXPERIENCED", "FRESHER"],
      default: null,
    },

    avatar: {
      type: String,
      default: null,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    location: {
      type: String,
      default: null,
      trim: true,
    },

    headline: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    bio: {
      type: String,
      default: null,
      maxlength: 1000,
    },

    skills: [
      {
        type: String,
        trim: true,
      },
    ],

    totalExperience: {
      years: {
        type: Number,
        default: 0,
        min: 0,
      },

      months: {
        type: Number,
        default: 0,
        min: 0,
        max: 11,
      },
    },

    experience: [
      {
        company: {
          type: String,
          trim: true,
        },

        designation: {
          type: String,
          trim: true,
        },

        location: {
          type: String,
          trim: true,
        },

        startDate: {
          type: Date,
        },

        endDate: {
          type: Date,
        },

        currentlyWorking: {
          type: Boolean,
          default: false,
        },

        description: {
          type: String,
          maxlength: 1000,
        },
      },
    ],

    education: [
      {
        degree: {
          type: String,
          trim: true,
        },

        institution: {
          type: String,
          trim: true,
        },

        fieldOfStudy: {
          type: String,
          trim: true,
        },

        startYear: {
          type: Number,
        },

        endYear: {
          type: Number,
        },

        grade: {
          type: String,
          trim: true,
        },
      },
    ],

    resume: {
      url: {
        type: String,
        default: null,
      },

      fileName: {
        type: String,
        default: null,
      },

      uploadedAt: {
        type: Date,
        default: null,
      },
    },

    preferredJobTitle: {
      type: String,
      default: null,
      trim: true,
    },

    preferredLocation: [
      {
        type: String,
        trim: true,
      },
    ],

    expectedSalary: {
      min: {
        type: Number,
        default: null,
      },

      max: {
        type: Number,
        default: null,
      },
    },

    noticePeriod: {
      type: String,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    refreshTokens: [
      {
        type: String,
      },
    ],

    // Incrementing this immediately invalidates every previously issued access
    // token, without needing to store each short-lived token in the database.
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
