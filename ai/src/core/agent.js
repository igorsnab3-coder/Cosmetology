import { complete } from "./provider.js";

const MAX_ROUNDS = 4;
const FALLBACK_REPLY =
  "Сейчас не удалось собрать полный ответ. Напишите ещё раз — подскажу по процедурам, магазину или записи.";

const parseArgs = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const safeToolError = (error) => {
  const text = String(error?.message || error || "tool failed")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[path]")
    .replace(/\/(?:home|Users|var|tmp)\/[^\s]+/g, "[path]")
    .slice(0, 200);
  return { error: text };
};

export async function runAgent({ apiKey, model, messages, tools, ctx, signal }) {
  const conversation = [...messages];
  let lastUsage = null;
  let degraded = false;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (signal?.aborted) {
      const error = new Error("AI request aborted");
      error.status = 499;
      error.publicMessage = "Request cancelled";
      throw error;
    }

    const message = await complete({ apiKey, model, messages: conversation, tools, signal });
    if (message.usage) lastUsage = message.usage;
    conversation.push({
      role: message.role || "assistant",
      content: message.content ?? null,
      tool_calls: message.tool_calls
    });

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      const text = String(message.content || "").trim();
      if (!text) {
        if (message.finish_reason === "length") {
          console.error("Jarvis agent: empty content after length finish_reason");
        } else if (message.finish_reason === "content_filter") {
          console.error("Jarvis agent: content filtered");
        }
        const error = new Error("OpenAI returned empty content");
        error.status = 502;
        error.publicMessage = "AI request failed";
        throw error;
      }
      return { reply: text, usage: lastUsage, rounds: round + 1, degraded };
    }

    for (const call of calls) {
      if (!call?.id) {
        console.error("Jarvis agent: tool_call without id, skipping round safely");
        return { reply: FALLBACK_REPLY, usage: lastUsage, rounds: round + 1, degraded: true };
      }
      const name = String(call?.function?.name || "");
      const tool = tools.find((item) => item.name === name);
      let result;
      try {
        if (!tool) {
          result = { error: `Unknown tool: ${name}` };
          degraded = true;
        } else {
          result = await tool.execute(parseArgs(call.function?.arguments), ctx);
        }
      } catch (error) {
        result = safeToolError(error);
        degraded = true;
      }
      if (result && typeof result === "object" && result.error) degraded = true;
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result ?? {})
      });
    }
  }

  console.error("Jarvis agent: max rounds reached without final text");
  return { reply: FALLBACK_REPLY, usage: lastUsage, rounds: MAX_ROUNDS, degraded: true };
}
