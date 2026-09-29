const { runAgent } = require("../agent/runAgent");

const MAX_HISTORY = 20;
const MAX_MSG_LEN = 2000;

// POST /api/agent/chat  body: { messages: [{ role: "user"|"assistant", content }] }
const chatWithAgent = async (req, res, next) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
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
          typeof m.content === "string",
      )
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_LEN) }));

    if (!history.length || history[history.length - 1].role !== "user") {
      return res
        .status(400)
        .json({ message: "Last message must be from the user" });
    }

    const result = await runAgent({ userId: req.user.userId, history });

    return res.status(200).json({
      message: "Assistant reply",
      reply: result.reply,
      proposals: result.proposals, // [{ type: "apply", jobId, title, reason }]
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { chatWithAgent };
