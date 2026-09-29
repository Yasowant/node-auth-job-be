const OpenAI = require("openai");

let client;
const getClient = () => {
  // Lazy so tests / boot don't crash when the key isn't set.
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
};

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** One model call. Returns the assistant message ({ content, tool_calls }). */
const chat = async (messages, tools) => {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.3,
  });
  return res.choices[0].message;
};

module.exports = { chat };
