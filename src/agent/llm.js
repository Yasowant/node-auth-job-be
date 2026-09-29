// The only file that talks to the LLM provider (Anthropic Claude).
// Swapping providers means changing this file (and the message format in
// runAgent.js), nothing else.
const {
  Anthropic,
  APIConnectionError,
  APIError,
} = require("@anthropic-ai/sdk");

const config = require("./config");

let client;
const getClient = () => {
  // Lazy so tests / boot don't crash when the key isn't set.
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: config.timeoutMs,
    maxRetries: config.retries,
    // Keys not scoped to a workspace are rejected (400) without this header.
    ...(config.workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": config.workspaceId } }
      : {}),
  });
  return client;
};

// Worth trying the next model: overloaded (529), rate limited, 5xx, network.
const shouldFallBack = (error) =>
  error instanceof APIConnectionError ||
  (error instanceof APIError &&
    (error.status === 429 || error.status === 529 || error.status >= 500));

/**
 * One model call. Tries the main model, then each fallback model in order.
 * @returns {Promise<import("@anthropic-ai/sdk").Anthropic.Message>}
 */
const chat = async ({ system, messages, tools }) => {
  const models = [config.model, ...config.fallbackModels];
  let lastError;

  for (const model of models) {
    try {
      return await getClient().messages.create({
        model,
        max_tokens: config.maxTokens,
        system,
        messages,
        tools,
      });
    } catch (error) {
      lastError = error;
      if (!shouldFallBack(error)) throw error;
      console.warn(`[agent] ${model} unavailable (${error.status ?? error.name}), trying next model`);
    }
  }

  throw lastError;
};

module.exports = { chat };
