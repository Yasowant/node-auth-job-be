const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { createJob } = require("../controllers/jobController");
const authorizeRoles = require("../middleware/roleMiddleware");
const router = express.Router();

router.post("/", authMiddleware, authorizeRoles("RECRUITER"), createJob);

module.exports = router;
