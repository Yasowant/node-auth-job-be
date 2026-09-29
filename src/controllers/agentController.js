const { APIError } = require("@anthropic-ai/sdk");

const config = require("../agent/config");
const { runAgent } = require("../agent/runAgent");

const MAX_MSG_LEN = 2000;

// POST /api/agent/chat  body: { messages: [{ role: "user"|"assistant", content }] }
const chatWithAgent = async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res
        .status(503)
        .json({ message: "AI assistant is not configured" });
    }

    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];

    // Only plain user/assistant text from the client - never system/tool messages.
    const history = raw
      .filter(
        (m) =>
          ["user", "assistant"].includes(m?.role) &&
          typeof m.content === "string" &&
          m.content.trim() !== "",
      )
      .slice(-config.history)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_LEN) }));

    // Claude requires the conversation to start with a user message.
    while (history.length && history[0].role !== "user") history.shift();

    if (!history.length || history[history.length - 1].role !== "user") {
      return res
        .status(400)
        .json({ message: "Last message must be from the user" });
    }

    const result = await runAgent({ userId: req.user.userId, history });

    return res.status(200).json({
      message: "Assistant reply",
      reply: result.reply,
      proposals: result.proposals, // [{ type: "apply", jobId, title, company, reason, screeningQuestions }]
    });
  } catch (error) {
    // Provider errors are ours to handle, not a generic 500 for the user.
    if (error instanceof APIError) {
      console.error("[agent] Anthropic error:", error.status, error.message);
      const misconfigured = error.status === 401 || error.status === 403;
      return res.status(misconfigured ? 503 : 502).json({
        message: misconfigured
          ? "AI assistant is not configured correctly"
          : "The AI assistant is busy right now. Please try again in a moment.",
      });
    }
    next(error);
  }
};

module.exports = { chatWithAgent };
