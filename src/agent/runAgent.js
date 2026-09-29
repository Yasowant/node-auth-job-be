const config = require("./config");
const { chat } = require("./llm");
const { definitions, handlers } = require("./tools");

const SYSTEM_PROMPT = `You are the job-search assistant for a job board.
- Always use tools to get jobs; never invent jobs, ids, companies or salaries.
- Map experience: 0-1 yrs = entry, 2-5 = mid, 6+ = senior.
- Choosing a search tool: search_jobs for exact filters (location, work mode, employment type, experience band); semantic_search_jobs for descriptive or vague requests where exact keywords may not match; match_jobs_to_my_profile when the user asks what suits them. If one returns nothing or an error, try another.
- When recommending from match_jobs_to_my_profile, say briefly WHY each job fits (overlapping skills/experience). Don't show raw matchScore numbers.
- Job ids only come from tool results. Never guess or build an id; if you don't have the id from a tool result in this turn, call search_jobs first.
- Keep answers short and in plain text (no Markdown headings or tables). Use "- " for bullet points; **bold** is allowed for job titles only.
- To apply, call propose_application and tell the user to press the "Apply" button. Never say you applied.
- If something is outside job search or the user's applications, say briefly what you can help with.`;

const textOf = (message) =>
  message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

/** Runs one tool call and returns an Anthropic tool_result block. */
const runTool = async (block, ctx) => {
  let result;
  let isError;

  try {
    const handler = handlers[block.name];
    if (!handler) throw new Error(`Unknown tool: ${block.name}`);
    if (process.env.NODE_ENV === "development") {
      console.log("[agent] tool:", block.name, block.input);
    }
    result = await handler(block.input ?? {}, ctx);
    isError = Boolean(result?.error);
  } catch (err) {
    result = { error: err.message };
    isError = true;
  }

  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: JSON.stringify(result).slice(0, config.maxResultBytes),
    ...(isError ? { is_error: true } : {}),
  };
};

/**
 * The agent loop: ask Claude -> run the tools it asks for -> send results
 * back -> repeat until it answers in text (or we hit maxRounds).
 */
const runAgent = async ({ userId, history }) => {
  const messages = [...history];
  const ctx = { userId, proposals: [] };

  for (let round = 0; round < config.maxRounds; round++) {
    const response = await chat({
      system: SYSTEM_PROMPT,
      messages: [...messages], // snapshot: we keep appending to our copy
      tools: definitions,
    });

    const toolCalls = response.content.filter((b) => b.type === "tool_use");

    // No tool requested -> Claude is done.
    if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
      return {
        reply: textOf(response) || "Sorry, I couldn't put an answer together. Please try rephrasing.",
        proposals: ctx.proposals,
      };
    }

    // Claude's turn (text + tool_use blocks) goes back into the history as-is,
    // then all tool results go in ONE user message, as the API requires.
    messages.push({ role: "assistant", content: response.content });
    const results = [];
    for (const call of toolCalls) {
      results.push(await runTool(call, ctx));
    }
    messages.push({ role: "user", content: results });
  }

  return {
    reply: "That took too many steps. Could you make the request more specific?",
    proposals: ctx.proposals,
  };
};

module.exports = { runAgent, SYSTEM_PROMPT };
