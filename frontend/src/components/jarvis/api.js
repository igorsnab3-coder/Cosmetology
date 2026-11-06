const TIMEOUT_MS = 70000;
const MAX_FILES = 4;
const MAX_FILE_SIZE = 12 * 1024 * 1024;
export const MAX_TOTAL_FILE_SIZE = 15 * 1024 * 1024;

export class ChatRequestError extends Error {
  constructor(message, { status = 0, code = "error", retryable = false } = {}) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const fileToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : "");
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });

const encodeFiles = async (files = [], { allowBinary = true } = {}) => {
  const out = [];
  let total = 0;
  for (const file of files.slice(0, MAX_FILES)) {
    const blob = file?.file;
    const size = Number(file?.size || blob?.size || 0);
    if (size > MAX_FILE_SIZE) continue;
    if (total + size > MAX_TOTAL_FILE_SIZE) break;
    total += size;
    const encoded = {
      name: String(file?.name || blob?.name || "файл").slice(0, 120),
      type: String(file?.type || blob?.type || ""),
      size
    };
    if (
      allowBinary &&
      blob &&
      typeof blob.arrayBuffer === "function" &&
      encoded.size <= MAX_FILE_SIZE
    ) {
      encoded.data = await fileToBase64(blob);
      out.push(encoded);
    } else if (file?.text) {
      encoded.text = String(file.text).slice(0, 8000);
      out.push(encoded);
    }
  }
  return out;
};

const statusMessage = (status, code) => {
  if (code === "timeout") return "ИИ не успел ответить вовремя. Можно продолжить в офлайн-режиме.";
  if (status === 429) return "Слишком много запросов. Подождите минуту и попробуйте снова.";
  if (status === 413) return "Файлы слишком большие для отправки. Уменьшите размер или количество.";
  if (status === 503) return "ИИ временно недоступен. Можно продолжить в офлайн-режиме.";
  if (status === 499 || code === "aborted") return "Запрос отменён.";
  return "Не удалось получить ответ ИИ.";
};

export async function askServer(messages, { signal: outerSignal } = {}) {
  const slice = messages.slice(-16);
  let lastUser = -1;
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    if (slice[i]?.role !== "bot") {
      lastUser = i;
      break;
    }
  }
  const payload = {
    messages: await Promise.all(
      slice.map(async (item, index) => ({
        role: item.role === "bot" ? "bot" : "user",
        text: String(item.text || "").slice(0, 2000),
        // Binary payloads only for the latest user turn; history keeps short text excerpts.
        files: await encodeFiles(item.files, { allowBinary: index === lastUser })
      }))
    )
  };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store"
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const code =
        response.status === 429
          ? "rate_limited"
          : response.status === 413
            ? "payload_too_large"
            : response.status === 503
              ? "unavailable"
              : response.status === 499
                ? "aborted"
                : "http_error";
      throw new ChatRequestError(statusMessage(response.status, code), {
        status: response.status,
        code,
        retryable: response.status === 429 || response.status >= 500
      });
    }
    const reply = String(data?.reply || "").trim();
    if (!reply) {
      throw new ChatRequestError("Пустой ответ сервера.", {
        status: 502,
        code: "empty",
        retryable: true
      });
    }
    return {
      reply,
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      offline: false
    };
  } catch (error) {
    if (error instanceof ChatRequestError) throw error;
    if (error?.name === "AbortError" || outerSignal?.aborted || controller.signal.aborted) {
      if (timedOut && !outerSignal?.aborted) {
        throw new ChatRequestError(statusMessage(0, "timeout"), {
          status: 504,
          code: "timeout",
          retryable: true
        });
      }
      throw new ChatRequestError(statusMessage(499, "aborted"), {
        status: 499,
        code: "aborted",
        retryable: true
      });
    }
    throw new ChatRequestError(statusMessage(0), {
      status: 0,
      code: "network",
      retryable: true
    });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onOuterAbort);
  }
}
