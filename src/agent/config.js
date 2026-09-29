// All AI assistant tuning lives in env vars so it can change per environment
// (local / Render) without a code change. Read once at startup.
const int = (name, fallback) => {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const list = (name) =>
  (process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

module.exports = {
  model,
  // Tried in order if the main model is overloaded / unavailable.
  fallbackModels: list("ANTHROPIC_FALLBACK_MODELS").filter((m) => m !== model),
  maxTokens: int("AI_ASSISTANT_MAX_TOKENS", 1024),
  // Max model calls per request (each tool round = one call).
  maxRounds: int("AI_ASSISTANT_MAX_ROUNDS", 6),
  timeoutMs: int("AI_ASSISTANT_TIMEOUT_MS", 45000),
  // SDK-level retries (429 / 5xx / overloaded) before moving to a fallback model.
  retries: int("AI_ASSISTANT_RETRIES", 2),
  // How many past chat messages are sent to the model.
  history: int("AI_ASSISTANT_HISTORY", 20),
  // Tool results bigger than this are truncated to keep tokens (cost) down.
  maxResultBytes: int("AI_ASSISTANT_MAX_RESULT_BYTES", 8000),
  // Upper bound on rows any search tool returns.
  maxRows: int("AI_ASSISTANT_MAX_ROWS", 10),
};
