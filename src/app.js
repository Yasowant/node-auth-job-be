const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const jobRoutes = require("./routes/jobRoutes");
const errorMiddleware = require("./middleware/errorMiddleware");
const { notFound } = require("./middleware/errorMiddleware");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

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

app.use("/api/auth", authRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/jobs", jobRoutes);

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
