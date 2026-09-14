const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const {
  createJob,
  getAllJobs,
  getJobById,
  getMyJobs,
} = require("../controllers/jobController");

const router = express.Router();

// Specific routes must be declared before "/:id", or "my/jobs" matches it.
router.get("/my/jobs", authMiddleware, authorizeRoles("RECRUITER"), getMyJobs);

router.post("/", authMiddleware, authorizeRoles("RECRUITER"), createJob);
router.get("/", getAllJobs);
router.get("/:id", getJobById);

module.exports = router;
