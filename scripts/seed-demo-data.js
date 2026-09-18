// One-off seed script - NOT part of the running app, run manually when you
// want sample data to test Jobs/Applications/Kafka against.
//
// Usage:  node scripts/seed-demo-data.js
//
// Creates (or reuses, if they already exist):
//   - a RECRUITER user + their Company + one ACTIVE Job
//   - a USER (candidate) with a resume already set on their profile
//
// This writes straight to MongoDB with Mongoose, bypassing the HTTP API -
// that's deliberate: registering a RECRUITER or setting a resume isn't
// possible through the API yet (register() always creates role "USER", and
// there's no resume-upload endpoint), so this script exists to get past
// that gap quickly for local testing. The actual "apply to this job" step
// is NOT done here on purpose - do that for real through Swagger UI
// (POST /applications) so it goes through the real applyToJob controller
// and actually publishes the application.created Kafka event.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const User = require("../src/models/User");
const Company = require("../src/models/Company");
const Job = require("../src/models/Jobs");

const RECRUITER = {
  name: "Demo Recruiter",
  email: "recruiter.demo@example.com",
  password: "RecruiterDemo123!",
};

const CANDIDATE = {
  name: "Demo Candidate",
  email: "candidate.demo@example.com",
  password: "CandidateDemo123!",
};

async function upsertUser({ name, email, password }, extraFields) {
  let user = await User.findOne({ email });

  if (user) {
    Object.assign(user, extraFields);
    await user.save();
    return user;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  user = await User.create({
    name,
    email,
    password: hashedPassword,
    workStatus: "EXPERIENCED",
    ...extraFields,
  });

  return user;
}

async function main() {
  await connectDB();

  // --- Recruiter + Company + Job -----------------------------------
  const recruiter = await upsertUser(RECRUITER, { role: "RECRUITER" });

  let company = await Company.findOne({ owner: recruiter._id });

  if (!company) {
    company = await Company.create({
      name: "Demo Company",
      slug: "demo-company",
      website: "https://example.com",
      industry: "Software",
      size: "11-50",
      about: "Seed data for local testing.",
      locations: ["Bangalore", "Remote"],
      owner: recruiter._id,
    });
  }

  let job = await Job.findOne({ company: company._id, title: "Backend Engineer" });

  if (!job) {
    job = await Job.create({
      title: "Backend Engineer",
      slug: `backend-engineer-${Date.now().toString(36)}`,
      company: company._id,
      postedBy: recruiter._id,
      description: "Seed job for testing the Applications + Kafka flow.",
      responsibilities: ["Design APIs", "Write tests"],
      requirements: ["2+ years Node.js"],
      category: "Engineering",
      skills: ["node.js", "express", "mongodb"],
      location: { city: "Bangalore", state: "Karnataka", country: "India" },
      workMode: "HYBRID",
      employmentType: "FULL_TIME",
      experience: { min: 2, max: 5 },
      salary: { min: 800000, max: 1400000, currency: "INR", period: "YEARLY", isDisclosed: true },
      openings: 2,
      status: "ACTIVE",
      publishedAt: new Date(),
    });
  }

  // --- Candidate with a resume already on their profile -------------
  const candidate = await upsertUser(CANDIDATE, {
    role: "USER",
    resume: {
      url: "https://example.com/resumes/demo-candidate.pdf",
      fileName: "demo-candidate-resume.pdf",
      uploadedAt: new Date(),
    },
  });

  console.log("\nSeed complete.\n");
  console.log("Recruiter login:", RECRUITER.email, "/", RECRUITER.password);
  console.log("Candidate login:", CANDIDATE.email, "/", CANDIDATE.password);
  console.log("Company:", company.name, `(${company._id})`);
  console.log("Job:    ", job.title, `(${job._id})`);
  console.log(
    "\nNow log in as the candidate in Swagger UI and POST /applications with:\n" +
      `  { "jobId": "${job._id}" }\n` +
      "That goes through the real controller, so it actually publishes application.created to Kafka.",
  );

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
