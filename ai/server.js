import http from "node:http";
import crypto from "node:crypto";
import { getStatus, handleChat } from "./src/index.js";

const HOST = process.env.JARVIS_AI_HOST || process.env.JARVIS_HOST || "127.0.0.1";
const PORT = Number(process.env.JARVIS_AI_PORT || 5600);
const MAX_BODY = 24 * 1024 * 1024;
const MAX_CONCURRENT = Number(process.env.JARVIS_AI_CONCURRENCY || 4);
const REQUEST_DEADLINE_MS = Number(process.env.JARVIS_AI_DEADLINE_MS || 60000);
const INTERNAL_TOKEN = String(process.env.JARVIS_INTERNAL_TOKEN || "").trim();

let activeChats = 0;
let shuttingDown = false;

const sendJson = (res, status, object) => {
  if (res.writableEnded) return;
  const body = Buffer.from(JSON.stringify(object), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": body.length
  });
  res.end(body);
};

const readBody = (req, { signal } = {}) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const ok = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onAbort = () => {
      const error = new Error("Request aborted");
      error.status = 499;
      error.publicMessage = "Request cancelled";
      try {
        req.destroy();
      } catch {
        // ignore
      }
      fail(error);
    };
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const error = new Error("Payload too large");
        error.status = 413;
        error.publicMessage = "Payload too large";
        req.destroy();
        fail(error);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => ok(Buffer.concat(chunks).toString("utf8"));
    const onError = (error) => fail(error);

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });

const authorize = (req) => {
  const header = String(req.headers["x-jarvis-internal"] || "");
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(INTERNAL_TOKEN);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

const attachDeadline = (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
  // IMPORTANT: do NOT listen to req "close" — on Node 16+ it fires when the
  // request body is fully consumed, not when the client disconnects. That would
  // abort every chat right after readBody. Use the response socket instead.
  const onResponseClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", onResponseClose);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true }
  );
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      res.off("close", onResponseClose);
    }
  };
};

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomBytes(8).toString("hex");
  res.setHeader("X-Request-Id", requestId);

  let url;
  try {
    url = new URL(req.url || "/", `http://${HOST}`);
  } catch {
    sendJson(res, 400, { ok: false, error: "Bad request" });
    return;
  }

  const lifetime = attachDeadline(req, res);

  try {
    if (shuttingDown) {
      sendJson(res, 503, { ok: false, error: "Shutting down" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ...getStatus(),
        active: activeChats,
        maxConcurrent: MAX_CONCURRENT
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/chat") {
      if (!authorize(req)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      if (activeChats >= MAX_CONCURRENT) {
        sendJson(res, 503, { ok: false, error: "AI busy, try again" });
        return;
      }

      activeChats += 1;
      try {
        const raw = await readBody(req, { signal: lifetime.signal });
        let payload = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          sendJson(res, 400, { ok: false, error: "Invalid JSON" });
          return;
        }
        const result = await handleChat(payload, {
          signal: lifetime.signal,
          requestId
        });
        sendJson(res, 200, {
          ok: true,
          degraded: Boolean(result.degraded),
          reply: result.reply,
          attachments: result.attachments || []
        });
      } finally {
        activeChats -= 1;
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const status = Number(error?.status) || 502;
    if (status >= 500 || status === 429) {
      console.error(
        JSON.stringify({
          event: "chat_error",
          requestId,
          status,
          code: error?.code || null,
          message: String(error?.message || error).slice(0, 300)
        })
      );
    }
    sendJson(res, status, {
      ok: false,
      error:
        error?.publicMessage ||
        (status === 429
          ? "Too many AI requests"
          : status === 413
            ? "Payload too large"
            : status === 499
              ? "Request cancelled"
              : status === 502
                ? "AI request failed"
                : "Request failed")
    });
  } finally {
    lifetime.dispose();
  }
});

server.requestTimeout = REQUEST_DEADLINE_MS + 5000;
server.headersTimeout = 30000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 50;

server.on("error", (error) => {
  console.error("Jarvis core listen failed:", error?.message || error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Jarvis core crash:", error);
  // Keep process alive for transient parser bugs; exit only if server cannot listen.
});

process.on("unhandledRejection", (error) => {
  console.error("Jarvis core rejection:", error);
});

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Jarvis AI core shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (!INTERNAL_TOKEN) {
  console.error("CRITICAL: JARVIS_INTERNAL_TOKEN is required; refusing to start AI core");
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(`Jarvis AI core on http://${HOST}:${PORT}/`);
});
