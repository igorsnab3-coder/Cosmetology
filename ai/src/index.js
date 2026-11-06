import { runAgent } from "./core/agent.js";
import { createContext, loadConfig } from "./core/context.js";
import { toOpenAIMessages } from "./core/prompt.js";
import { loadTools } from "./core/registry.js";

const httpError = (status, publicMessage, message, code) => {
  const error = new Error(message || publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  if (code) error.code = code;
  return error;
};

export function getStatus() {
  const { apiKey, model } = loadConfig();
  return { ok: true, ai: Boolean(apiKey), model: apiKey ? model : null };
}

export async function handleChat(payload, { signal, requestId } = {}) {
  const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  if (!rawMessages.length) {
    throw httpError(400, "Missing messages");
  }

  const { apiKey, model } = loadConfig();
  if (!apiKey) {
    throw httpError(503, "AI is not configured", "", "not_configured");
  }

  const started = Date.now();
  const ctx = createContext();
  const tools = await loadTools();
  if (signal?.aborted) {
    throw httpError(499, "Request cancelled", "aborted", "aborted");
  }
  const { messages, attachments } = await toOpenAIMessages(rawMessages, { signal });
  if (messages.length < 2) {
    throw httpError(400, "Missing messages");
  }

  const result = await runAgent({ apiKey, model, messages, tools, ctx, signal });
  const ms = Date.now() - started;
  console.log(
    JSON.stringify({
      event: "chat_ok",
      requestId: requestId || null,
      ms,
      model,
      rounds: result.rounds || null,
      degraded: Boolean(result.degraded),
      usage: result.usage || null
    })
  );
  return { reply: result.reply, attachments, degraded: Boolean(result.degraded) };
}
