const express = require("express");
const rateLimit = require("express-rate-limit");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const { chatWithAgent } = require("../controllers/agentController");

const router = express.Router();

// Every call costs money - tight per-user limit. Disabled under test like the others.
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.userId,
  message: { message: "Too many assistant requests. Try again in a minute." },
  skip: () => process.env.NODE_ENV === "test",
});

router.post(
  "/chat",
  authMiddleware,
  authorizeRoles("USER"),
  agentLimiter,
  chatWithAgent,
);

module.exports = router;
