const rateLimit = require("express-rate-limit");

// Tests drive these routes dozens of times in a few seconds, so the limiter
// would fail the suite rather than the attacker. Disabled only under test.
const skip = () => process.env.NODE_ENV === "test";

const message = {
  message: "Too many attempts. Please try again later.",
};

/** Brute-force protection for credential checks. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message,
  skip,
});

/** Password-reset flows: slower still, since each one sends mail or burns a token. */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip,
});

/** A broad ceiling for everything else. */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip,
});

module.exports = { loginLimiter, passwordResetLimiter, apiLimiter };
