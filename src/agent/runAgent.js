const { chat } = require("./llm");
const { definitions, handlers } = require("./tools");

const MAX_STEPS = 6;

const SYSTEM_PROMPT = `You are the job-search assistant for a job board.
- Always use tools to get jobs; never invent jobs, ids, companies or salaries.
- Map experience: 0-1 yrs = entry, 2-5 = mid, 6+ = senior.
- Keep answers short: bullet lists, highlight key differences when comparing.
- To apply, call propose_application and tell the user to press the "Apply" button. Never say you applied.
- If something is outside job search or the user's applications, say briefly what you can help with.`;

const runAgent = async ({ userId, history }) => {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  const ctx = { userId, proposals: [] };

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await chat(messages, definitions);
    messages.push(reply);

    // No tool requested -> the model is done.
    if (!reply.tool_calls?.length) {
      return { reply: reply.content, proposals: ctx.proposals };
    }

    // Run every tool the model asked for, feed results back.
    for (const call of reply.tool_calls) {
      let result;
      try {
        const handler = handlers[call.function.name];
        if (!handler) throw new Error(`Unknown tool: ${call.function.name}`);
        const args = JSON.parse(call.function.arguments || "{}");
        if (process.env.NODE_ENV === "development") {
          console.log("[agent] tool:", call.function.name, args);
        }
        result = await handler(args, ctx);
      } catch (err) {
        result = { error: err.message };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }

  return {
    reply:
      "That took too many steps. Could you make the request more specific?",
    proposals: ctx.proposals,
  };
};

module.exports = { runAgent };
