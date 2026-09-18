const express = require("express");
const router = express.Router();

const {
  applyToJob,
  getMyApplications,
  getApplicantsForJob,
  updateApplicationStatus,
  withdrawApplication,
} = require("../controllers/applicationController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

router.get("/my", authMiddleware, authorizeRoles("USER"), getMyApplications);

router.get(
  "/job/:jobId",
  authMiddleware,
  authorizeRoles("RECRUITER"),
  getApplicantsForJob,
);

router.post("/", authMiddleware, authorizeRoles("USER"), applyToJob);

router.patch(
  "/:id/status",
  authMiddleware,
  authorizeRoles("RECRUITER"),
  updateApplicationStatus,
);

router.patch(
  "/:id/withdraw",
  authMiddleware,
  authorizeRoles("USER"),
  withdrawApplication,
);

module.exports = router;
