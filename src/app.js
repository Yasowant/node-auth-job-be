const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const jobRoutes = require("./routes/jobRoutes");
const errorMiddleware = require("./middleware/errorMiddleware");
const { notFound } = require("./middleware/errorMiddleware");
const { apiLimiter } = require("./middleware/rateLimitMiddleware");
const {
  csrfMiddleware,
  issueCsrfToken,
} = require("./middleware/csrfMiddleware");

const app = express();

// Behind Caddy/Nginx the socket address is the proxy, so rate limits and logs
// would all key off one IP. Trust exactly one hop - never `true`, which lets a
// client forge X-Forwarded-For and slip past the limiter entirely.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use(csrfMiddleware);

app.get("/", (req, res) => {
  res.json({
    message: "API is running",
  });
});

const DB_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

app.get("/health", (req, res) => {
  const state = mongoose.connection.readyState;

  res.status(state === 1 ? 200 : 503).json({
    status: state === 1 ? "ok" : "degraded",
    database: DB_STATES[state] || "unknown",
    uptime: process.uptime(),
  });
});

// Browser clients call this once, then echo the token in X-CSRF-Token for
// every state-changing API request.
app.get("/api/csrf-token", issueCsrfToken);

app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/jobs", jobRoutes);

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
