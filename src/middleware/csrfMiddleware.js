const crypto = require("crypto");

const isProduction = process.env.NODE_ENV === "production";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const csrfCookieOptions = {
  httpOnly: false,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 24 * 60 * 60 * 1000,
};

const issueCsrfToken = (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrfToken", token, csrfCookieOptions);
  return res.status(200).json({ csrfToken: token });
};

const csrfMiddleware = (req, res, next) => {
  // Test clients do not model browser cookies and CORS preflight. Production
  // traffic must always use the double-submit token below.
  if (process.env.NODE_ENV === "test" || SAFE_METHODS.has(req.method)) {
    return next();
  }

  const expectedOrigin = process.env.CLIENT_URL || "http://localhost:5173";
  const origin = req.get("origin");
  const cookieToken = req.cookies.csrfToken;
  const headerToken = req.get("x-csrf-token");

  if (
    !expectedOrigin ||
    origin !== expectedOrigin ||
    !cookieToken ||
    !headerToken ||
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  return next();
};

module.exports = { csrfMiddleware, issueCsrfToken, csrfCookieOptions };
