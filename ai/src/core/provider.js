const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const abortError = () => {
  const error = new Error("AI request aborted");
  error.status = 499;
  error.publicMessage = "Request cancelled";
  error.code = "aborted";
  return error;
};

const maskSecrets = (text) =>
  String(text || "")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "sk-***")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer ***")
    .slice(0, 300);

const isRetryable = (status) => status === 429 || status >= 500;

export function toOpenAITools(tools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.parameters || { type: "object", properties: {} }
    }
  }));
}

async function completeOnce({ apiKey, model, messages, tools, signal }) {
  const body = {
    model,
    messages,
    max_completion_tokens: 900
  };
  if (tools?.length) {
    body.tools = toOpenAITools(tools);
    body.tool_choice = "auto";
  }

  let response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw abortError();
    const wrapped = new Error(maskSecrets(error?.message || "network error"));
    wrapped.status = 502;
    wrapped.publicMessage = "AI request failed";
    wrapped.code = "network";
    wrapped.retryable = true;
    throw wrapped;
  }

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errText = maskSecrets(data?.error?.message || raw || `HTTP ${response.status}`);
    const error = new Error(`OpenAI HTTP ${response.status}: ${errText}`);
    error.status = response.status === 401 || response.status === 403 ? 502 : response.status === 429 ? 429 : 502;
    error.publicMessage =
      response.status === 429 ? "Too many AI requests" : "AI request failed";
    error.code = `openai_${response.status}`;
    error.retryable = isRetryable(response.status);
    error.retryAfterMs = Number(response.headers.get("retry-after")) * 1000 || 0;
    throw error;
  }

  const choice = data?.choices?.[0];
  const message = choice?.message;
  if (!message) {
    const error = new Error("OpenAI returned empty message");
    error.status = 502;
    error.publicMessage = "AI request failed";
    error.code = "empty_message";
    throw error;
  }

  message.finish_reason = choice?.finish_reason || "";
  message.usage = data?.usage || null;
  return message;
}

export async function complete({ apiKey, model, messages, tools, signal }) {
  let attempt = 0;
  for (;;) {
    if (signal?.aborted) throw abortError();
    try {
      return await completeOnce({ apiKey, model, messages, tools, signal });
    } catch (error) {
      if (!error?.retryable || attempt >= MAX_RETRIES || signal?.aborted) throw error;
      const delay = error.retryAfterMs || BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 200);
      attempt += 1;
      await sleep(delay, signal);
    }
  }
}
