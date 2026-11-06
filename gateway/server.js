import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.JARVIS_ROOT || path.join(__dirname, ".."));
const PORT = Number(process.env.PORT || process.env.JARVIS_GATEWAY_PORT || 5500);
const HOST = process.env.JARVIS_GATEWAY_HOST || "0.0.0.0";
const DATA_DIR = path.resolve(process.env.JARVIS_DATA_DIR || path.join(ROOT, "data"));
const STATIC_ROOT = path.resolve(process.env.JARVIS_STATIC_ROOT || path.join(ROOT, "dist"));
const ENV_FILE = path.resolve(
  process.env.JARVIS_ENV_FILE || path.join(ROOT, ".env")
);

const DB_HOST = process.env.JARVIS_DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.JARVIS_DB_PORT || 5601);
const AI_HOST = process.env.JARVIS_AI_HOST || "127.0.0.1";
const AI_PORT = Number(process.env.JARVIS_AI_PORT || 5600);
const PDF_HOST = process.env.JARVIS_PDF_HOST || "127.0.0.1";
const PDF_PORT = Number(process.env.JARVIS_PDF_PORT || 5602);

const SESSION_TTL_HOURS = 12;
const CHAT_RATE_PER_IP = 12;
const CHAT_RATE_GLOBAL = 60;
const LOGIN_RATE_PER_IP = 8;
const ORDER_RATE_PER_MIN = 12;

const BOOKING_PROCEDURE_NAMES = [
  "Мезотерапия",
  "Биоревитализация",
  "Чистка лица",
  "Микротоки",
  "Неинвазивная мезотерапия",
  "Уходовая процедура",
  "Консультация"
];
const BOOKING_TIME_SLOTS = [
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00"
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function readDotEnv(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

const fileEnv = readDotEnv(ENV_FILE);
const env = (key, fallback = "") => {
  const fromProcess = process.env[key];
  if (fromProcess != null && String(fromProcess).trim() !== "") {
    return String(fromProcess).trim();
  }
  if (fileEnv[key] != null && String(fileEnv[key]).trim() !== "") {
    return String(fileEnv[key]).trim();
  }
  return fallback;
};

const ADMIN_PASSWORD = env("ADMIN_PASSWORD");
const OPENAI_API_KEY = env("OPENAI_API_KEY");
const TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN");
const TELEGRAM_USER = env("TELEGRAM_USER", "yana_ivi").replace(/^@/, "");
let telegramChatId = env("TELEGRAM_CHAT_ID");
let INTERNAL_TOKEN = env("JARVIS_INTERNAL_TOKEN");
if (!INTERNAL_TOKEN) {
  INTERNAL_TOKEN = crypto.randomBytes(32).toString("hex");
  process.env.JARVIS_INTERNAL_TOKEN = INTERNAL_TOKEN;
}

if (!ADMIN_PASSWORD) {
  console.error(`ADMIN_PASSWORD is required in ${ENV_FILE} or environment`);
  process.exit(1);
}
if (ADMIN_PASSWORD === "yana2026" || ADMIN_PASSWORD.length < 10) {
  console.error("ADMIN_PASSWORD is too weak. Use 10+ unique characters.");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const telegramChatCacheFile = path.join(DATA_DIR, "telegram_chat_id.txt");
const telegramOutboxFile = path.join(DATA_DIR, "telegram_outbox.jsonl");
const telegramNotifiedFile = path.join(DATA_DIR, "telegram_notified.json");

const sessions = new Map();
const chatHitsByIp = new Map();
const chatHitsGlobal = [];
const loginHitsByIp = new Map();
const orderHits = [];
let productsListCache = null;
let productsListCacheAt = 0;
let telegramOutboxLastAt = 0;

const asArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com; worker-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://yandex.ru https://*.yandex.ru; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
};

const sendJson = (res, status, object) => {
  if (res.writableEnded) return;
  const body = Buffer.from(JSON.stringify(object), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    "Content-Length": body.length
  });
  res.end(body);
};

const sendRawJson = (res, status, json) => {
  if (res.writableEnded) return;
  const body = Buffer.from(json, "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": body.length
  });
  res.end(body);
};

const sendText = (res, status, text, contentType = "text/plain; charset=utf-8") => {
  if (res.writableEnded) return;
  const body = Buffer.from(text, "utf8");
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Content-Length": body.length
  });
  res.end(body);
};

const readBody = (req, maxBytes = 262144) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error("Payload too large");
        err.status = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

async function proxyJson(baseHost, basePort, pathname, { method = "GET", body, headers = {}, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${baseHost}:${basePort}${pathname}`, {
      method,
      headers,
      body: body == null ? undefined : body,
      signal: controller.signal
    });
    const text = await response.text();
    return { status: response.status, content: text, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

const dbProxy = (pathname, opts) => proxyJson(DB_HOST, DB_PORT, pathname, opts);
const aiProxy = (pathname, opts = {}) =>
  proxyJson(AI_HOST, AI_PORT, pathname, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      "X-Jarvis-Internal": INTERNAL_TOKEN
    }
  });
const pdfProxy = (pathname, opts = {}) =>
  proxyJson(PDF_HOST, PDF_PORT, pathname, {
    ...opts,
    timeoutMs: opts.timeoutMs || 120000
  });

async function testDbReady() {
  try {
    const result = await dbProxy("/health", { timeoutMs: 2000 });
    if (result.status !== 200) return false;
    const data = JSON.parse(result.content || "{}");
    if (data && data.ok === false) return false;
    if (data && data.dirty) return false;
    return true;
  } catch {
    return false;
  }
}

async function testAiReady() {
  try {
    const result = await aiProxy("/health", { timeoutMs: 2000 });
    if (result.status !== 200) return false;
    return /"ai"\s*:\s*true/.test(result.content || "");
  } catch {
    return false;
  }
}

async function testPdfReady() {
  try {
    const result = await pdfProxy("/health", { method: "GET", timeoutMs: 2000 });
    return result.status === 200;
  } catch {
    return false;
  }
}

function normalizePhoneDigits(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function formatPhoneDisplayRu(phone) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length !== 11 || !digits.startsWith("7")) return digits;
  const rest = digits.slice(1);
  return `+7 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 8)}-${rest.slice(8, 10)}`;
}

function testBookingDateValid(isoDate, isoTime = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const selected = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selected < today) return false;
  const max = new Date(today);
  max.setDate(max.getDate() + 180);
  if (selected > max) return false;
  const match = String(isoTime || "").match(/^(\d{2}):(\d{2})$/);
  if (match && selected.getTime() === today.getTime()) {
    const slot = new Date(selected);
    slot.setHours(Number(match[1]), Number(match[2]), 0, 0);
    if (slot < new Date()) return false;
  }
  return true;
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
  return match ? match[1].trim() : null;
}

function clearExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expires < now) sessions.delete(token);
  }
}

function testAdminAuth(req) {
  clearExpiredSessions();
  const token = getBearerToken(req);
  return Boolean(token && sessions.has(token));
}

function newAdminSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { expires: Date.now() + SESSION_TTL_HOURS * 3600 * 1000 });
  return token;
}

function getClientIp(req) {
  const remote = req.socket?.remoteAddress || "";
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === ":ffff:127.0.0.1";
  if (isLoopback) {
    const xff = String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    if (/^[0-9a-fA-F.:]+$/.test(xff)) return xff;
  }
  return remote.replace(/^:ffff:/, "") || "unknown";
}

function pruneQueue(queue, windowMs) {
  const cutoff = Date.now() - windowMs;
  while (queue.length && queue[0] < cutoff) queue.shift();
}

function testChatRate(clientIp) {
  const now = Date.now();
  pruneQueue(chatHitsGlobal, 60_000);
  if (chatHitsGlobal.length >= CHAT_RATE_GLOBAL) return false;
  if (!chatHitsByIp.has(clientIp)) chatHitsByIp.set(clientIp, []);
  const bucket = chatHitsByIp.get(clientIp);
  pruneQueue(bucket, 60_000);
  if (bucket.length >= CHAT_RATE_PER_IP) return false;
  bucket.push(now);
  chatHitsGlobal.push(now);
  return true;
}

function testLoginRate(clientIp) {
  const now = Date.now();
  if (!loginHitsByIp.has(clientIp)) loginHitsByIp.set(clientIp, []);
  const bucket = loginHitsByIp.get(clientIp);
  pruneQueue(bucket, 60_000);
  if (bucket.length >= LOGIN_RATE_PER_IP) return false;
  bucket.push(now);
  return true;
}

function testOrderRate() {
  const now = Date.now();
  pruneQueue(orderHits, 60_000);
  if (orderHits.length >= ORDER_RATE_PER_MIN) return false;
  orderHits.push(now);
  return true;
}

function normalizeProduct(item) {
  if (!item) return null;
  let type = String(item.type || "");
  if (type !== "service") type = "product";
  const price = Math.round(Number(item.price) || 0);
  if (price <= 0) return null;
  const name = String(item.name || "").trim();
  if (!name) return null;
  let id = String(item.id || "").trim();
  if (!id) id = `p${Date.now()}`;
  const image = String(item.image || "").trim();
  if (!image) return null;
  let stock = null;
  if (type === "product") {
    if (!Object.prototype.hasOwnProperty.call(item, "stock")) stock = 10;
    else {
      stock = Math.max(0, Math.min(99999, Math.round(Number(item.stock) || 0)));
    }
  }
  return { id, type, name, description: String(item.description || "").trim(), price, image, stock };
}

function clearProductsCache() {
  productsListCache = null;
  productsListCacheAt = 0;
}

async function getProductsList(force = false) {
  if (!force && productsListCache && Date.now() - productsListCacheAt < 2000) {
    return productsListCache;
  }
  if (!(await testDbReady())) throw new Error("SQLite DB is not ready");
  const proxy = await dbProxy("/products");
  if (proxy.status !== 200) throw new Error("Failed to load products");
  const data = JSON.parse(proxy.content || "{}");
  const list = asArray(data.products).map(normalizeProduct).filter(Boolean);
  productsListCache = list;
  productsListCacheAt = Date.now();
  return list;
}

function newSecureOrderId(kind = "order") {
  const prefix = kind === "booking" ? "book" : "ord";
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function testClientOrderId(id, kind = "order") {
  if (kind === "booking") return /^book_[a-fA-F0-9]{20,64}$/.test(id);
  return /^ord_[a-fA-F0-9]{20,64}$/.test(id);
}

function readNotifiedMap() {
  if (!fs.existsSync(telegramNotifiedFile)) return {};
  try {
    const raw = fs.readFileSync(telegramNotifiedFile, "utf8");
    if (!raw.trim()) return {};
    const obj = JSON.parse(raw);
    const map = {};
    for (const [key, value] of Object.entries(obj || {})) map[key] = Boolean(value);
    return map;
  } catch {
    return {};
  }
}

function setTelegramNotified(orderId, ok) {
  if (!orderId) return;
  const map = readNotifiedMap();
  map[orderId] = Boolean(ok);
  const keys = Object.keys(map);
  const trimmed = keys.length > 500 ? keys.slice(-500) : keys;
  const out = {};
  for (const key of trimmed) out[key] = map[key];
  fs.writeFileSync(telegramNotifiedFile, JSON.stringify(out), "utf8");
}

function getTelegramNotified(orderId) {
  if (!orderId) return null;
  const map = readNotifiedMap();
  return Object.prototype.hasOwnProperty.call(map, orderId) ? Boolean(map[orderId]) : null;
}

function addTelegramOutbox(order) {
  if (!order?.id) return;
  fs.appendFileSync(telegramOutboxFile, `${JSON.stringify(order)}\n`, "utf8");
}

async function resolveTelegramChatId() {
  if (telegramChatId) return telegramChatId;
  if (fs.existsSync(telegramChatCacheFile)) {
    const cached = fs.readFileSync(telegramChatCacheFile, "utf8").trim();
    if (cached) {
      telegramChatId = cached;
      return cached;
    }
  }
  if (!TELEGRAM_BOT_TOKEN) return null;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=50`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await response.json();
    if (!data?.ok) return null;
    let preferred = null;
    let fallback = null;
    for (const update of asArray(data.result)) {
      const message = update.message || update.edited_message;
      if (!message?.chat) continue;
      const username = String(message.from?.username || message.chat.username || "")
        .replace(/^@/, "")
        .toLowerCase();
      const id = String(message.chat.id || "");
      if (!id) continue;
      if (username === TELEGRAM_USER.toLowerCase()) {
        preferred = id;
        break;
      }
      if (!fallback) fallback = id;
    }
    const resolved = preferred || fallback;
    if (resolved) {
      telegramChatId = resolved;
      fs.writeFileSync(telegramChatCacheFile, resolved, "utf8");
      return resolved;
    }
  } catch (error) {
    console.log(`Telegram chat resolve failed: ${error.message}`);
  }
  return null;
}

function formatTelegramOrderText(order) {
  const isBooking = String(order.kind) === "booking" || String(order.channel) === "booking";
  const lines = [];
  if (isBooking) {
    lines.push("Новая запись на сайте", "", `ID: ${order.id}`);
    lines.push(`Клиент: ${order.customer?.name || ""}`);
    lines.push(`Телефон: ${order.customer?.phoneDisplay || ""}`);
    const proc =
      order.booking?.procedure ||
      asArray(order.items)[0]?.name ||
      "";
    if (proc) lines.push(`Процедура: ${proc}`);
    if (order.booking?.date) lines.push(`Дата: ${order.booking.date}`);
    if (order.booking?.time) lines.push(`Время: ${order.booking.time}`);
    if (order.booking?.note) lines.push(`Комментарий: ${order.booking.note}`);
    lines.push("", `@${TELEGRAM_USER}`);
    return lines.join("\n");
  }
  lines.push("Новый заказ на сайте", "", `ID: ${order.id}`);
  lines.push(`Клиент: ${order.customer?.name || ""}`);
  lines.push(`Телефон: ${order.customer?.phoneDisplay || ""}`);
  lines.push(`Канал: ${order.channel || ""}`, "");
  for (const item of asArray(order.items)) {
    lines.push(`- ${item.name} x${item.quantity} = ${item.lineTotal} RUB`);
  }
  lines.push("", `Итого: ${order.total} RUB`, "", `@${TELEGRAM_USER}`);
  return lines.join("\n");
}

async function sendTelegramOrderNotify(order) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram notify skipped: TELEGRAM_BOT_TOKEN is empty");
    return false;
  }
  const chatId = await resolveTelegramChatId();
  if (!chatId) {
    console.log(`Telegram notify skipped: chat id for @${TELEGRAM_USER} not found`);
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatTelegramOrderText(order),
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (data?.ok) {
      console.log(`Telegram notify sent to @${TELEGRAM_USER}`);
      return true;
    }
    console.log("Telegram notify failed: API returned ok=false");
  } catch (error) {
    console.log(`Telegram notify failed: ${error.message}`);
  }
  return false;
}

async function completeTelegramOutbox() {
  if (!fs.existsSync(telegramOutboxFile)) return;
  if (Date.now() - telegramOutboxLastAt < 20_000) return;
  telegramOutboxLastAt = Date.now();
  if (!TELEGRAM_BOT_TOKEN) return;
  let lines = [];
  try {
    lines = fs.readFileSync(telegramOutboxFile, "utf8").split(/\r?\n/).filter(Boolean);
  } catch {
    return;
  }
  if (!lines.length) return;
  const remaining = [];
  for (const line of lines) {
    let order = null;
    try {
      order = JSON.parse(line);
    } catch {
      continue;
    }
    if (!order?.id) continue;
    if (getTelegramNotified(String(order.id)) === true) continue;
    const sent = await sendTelegramOrderNotify(order);
    if (sent) setTelegramNotified(String(order.id), true);
    else remaining.push(line);
  }
  if (!remaining.length) {
    try {
      fs.unlinkSync(telegramOutboxFile);
    } catch {
      // ignore
    }
  } else {
    fs.writeFileSync(telegramOutboxFile, `${remaining.join("\n")}\n`, "utf8");
  }
}

function isBlockedPath(fullPath) {
  const name = path.basename(fullPath).toLowerCase();
  const ext = path.extname(fullPath).toLowerCase();
  if ([".env", "serve.ps1", "help.txt"].includes(name)) return true;
  if ([".ps1", ".env", ".bak", ".sql"].includes(ext)) return true;
  if (name.startsWith(".")) return true;
  return false;
}

function serveStatic(req, res, urlPath) {
  if (!fs.existsSync(path.join(STATIC_ROOT, "index.html"))) {
    sendText(res, 503, "Frontend is not built. Run frontend build or docker image rebuild.");
    return;
  }
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  const full = path.resolve(STATIC_ROOT, rel);
  if (!full.startsWith(STATIC_ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (isBlockedPath(full) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(full).toLowerCase();
  const bytes = fs.readFileSync(full);
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    ...SECURITY_HEADERS,
    "Content-Length": bytes.length
  };
  if (ext === ".html") headers["Cache-Control"] = "no-cache";
  else if ([".js", ".css", ".woff2", ".png", ".jpg", ".webp", ".svg"].includes(ext)) {
    headers["Cache-Control"] = "public, max-age=86400";
  }
  res.writeHead(200, headers);
  res.end(bytes);
}

const server = http.createServer(async (req, res) => {
  const method = String(req.method || "GET").toUpperCase();
  let url;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch {
    sendJson(res, 400, { ok: false, error: "Bad request" });
    return;
  }
  const pathname = decodeURIComponent(url.pathname);

  try {
    void completeTelegramOutbox();

    if (pathname === "/api/health") {
      const dbReady = await testDbReady();
      const aiReady = await testAiReady();
      const pdfReady = await testPdfReady();
      sendJson(res, dbReady ? 200 : 503, {
        ok: Boolean(dbReady),
        storage: "sqlite",
        ai: Boolean(OPENAI_API_KEY && aiReady),
        db: Boolean(dbReady),
        pdf: Boolean(pdfReady)
      });
      return;
    }

    if (pathname === "/api/admin/login" && method === "POST") {
      const loginIp = getClientIp(req);
      if (!testLoginRate(loginIp)) {
        sendJson(res, 429, { ok: false, error: "Too many login attempts" });
        return;
      }
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (String(body.password || "") === ADMIN_PASSWORD) {
        sendJson(res, 200, {
          ok: true,
          token: newAdminSession(),
          expiresInHours: SESSION_TTL_HOURS
        });
      } else {
        sendJson(res, 401, { ok: false, error: "Invalid password" });
      }
      return;
    }

    if (pathname === "/api/admin/logout" && method === "POST") {
      const token = getBearerToken(req);
      if (token) sessions.delete(token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/api/admin/session" && method === "GET") {
      sendJson(res, 200, { ok: testAdminAuth(req) });
      return;
    }

    if (pathname === "/api/chat" && method === "POST") {
      if (!OPENAI_API_KEY) {
        sendJson(res, 503, { ok: false, error: "AI is not configured" });
        return;
      }
      if (!testChatRate(getClientIp(req))) {
        sendJson(res, 429, { ok: false, error: "Too many requests" });
        return;
      }
      let rawBody = "";
      try {
        rawBody = await readBody(req, 24 * 1024 * 1024);
      } catch (error) {
        sendJson(res, error.status || 400, { ok: false, error: error.message || "Bad request" });
        return;
      }
      if (!rawBody || !/"messages"\s*:/.test(rawBody)) {
        sendJson(res, 400, { ok: false, error: "Missing messages" });
        return;
      }
      try {
        const proxy = await aiProxy("/chat", {
          method: "POST",
          body: rawBody,
          headers: { "Content-Type": "application/json; charset=utf-8" },
          timeoutMs: 65000
        });
        if (proxy.content) sendRawJson(res, proxy.status, proxy.content);
        else sendJson(res, 502, { ok: false, error: "AI request failed" });
      } catch (error) {
        console.log(`AI chat failed: ${error.message}`);
        sendJson(res, 502, { ok: false, error: "AI request failed" });
      }
      return;
    }

    if (pathname.startsWith("/api/pdf")) {
      if (method !== "GET") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }
      if (!testAdminAuth(req)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      if (!(await testPdfReady())) {
        sendJson(res, 503, { ok: false, error: "PDF service is not ready" });
        return;
      }
      let upstreamPath = pathname.slice("/api/pdf".length) || "/";
      if (!upstreamPath.startsWith("/")) upstreamPath = `/${upstreamPath}`;
      if (url.search) upstreamPath += url.search;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        const response = await fetch(`http://${PDF_HOST}:${PDF_PORT}${upstreamPath}`, {
          method: "GET",
          headers: {
            Authorization: req.headers.authorization || ""
          },
          signal: controller.signal
        });
        clearTimeout(timer);
        const buffer = Buffer.from(await response.arrayBuffer());
        const headers = {
          "Content-Type":
            response.headers.get("content-type") ||
            (response.status >= 400 ? "application/json; charset=utf-8" : "application/pdf"),
          "Cache-Control": "no-store",
          "Content-Length": buffer.length
        };
        const disposition = response.headers.get("content-disposition");
        if (disposition) headers["Content-Disposition"] = disposition;
        res.writeHead(response.status, headers);
        res.end(buffer);
      } catch (error) {
        console.log(`PDF proxy failed: ${error.message}`);
        sendJson(res, 502, { ok: false, error: "PDF service failed" });
      }
      return;
    }

    if (pathname === "/api/products" && method === "GET") {
      if (!(await testDbReady())) {
        sendJson(res, 503, { ok: false, error: "Database unavailable" });
        return;
      }
      const proxy = await dbProxy("/products");
      if (proxy.status !== 200 && proxy.status !== 304) throw new Error("Failed to load products");
      const data = JSON.parse(proxy.content || "{}");
      const revision = Number(data.revision || 0) || 0;
      const inm = String(req.headers["if-none-match"] || "");
      const clientRevMatch = inm.match(/cat-(\d+)/);
      const clientRev = clientRevMatch ? Number(clientRevMatch[1]) : 0;
      if (revision > 0 && clientRev === revision && productsListCache) {
        res.writeHead(304, {
          ETag: `W/"cat-${revision}"`,
          "Cache-Control": "no-cache",
          "X-Catalog-Revision": String(revision)
        });
        res.end();
        return;
      }
      const list = asArray(data.products).map(normalizeProduct).filter(Boolean);
      productsListCache = list;
      productsListCacheAt = Date.now();
      const payload = JSON.stringify({ products: list, revision });
      const body = Buffer.from(payload, "utf8");
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
        ETag: `W/"cat-${revision}"`,
        "X-Catalog-Revision": String(revision),
        "Content-Length": body.length
      });
      res.end(body);
      return;
    }

    if (pathname === "/api/products" && method === "PUT") {
      if (!testAdminAuth(req)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req, 2 * 1024 * 1024));
      } catch (error) {
        sendJson(res, error.status || 400, { ok: false, error: error.message || "Bad JSON" });
        return;
      }
      const next = asArray(body.products).map(normalizeProduct).filter(Boolean);
      if (!next.length && !body.allowEmpty) {
        sendJson(res, 400, { ok: false, error: "Catalog cannot be empty" });
        return;
      }
      const overwriteStock = Boolean(body.overwriteStock) || body.preserveStock === false;
      const stockOverrides = asArray(body.stockOverrides)
        .map((id) => String(id || "").trim())
        .filter(Boolean);
      const payload = JSON.stringify({
        products: next,
        preserveStock: !overwriteStock,
        allowEmpty: Boolean(body.allowEmpty),
        stockOverrides
      });
      const proxy = await dbProxy("/products", {
        method: "PUT",
        body: payload,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        timeoutMs: 30000
      });
      clearProductsCache();
      if (proxy.status !== 200) {
        const err = JSON.parse(proxy.content || "{}");
        sendJson(res, proxy.status, { ok: false, error: err.error || "Failed to save products" });
        return;
      }
      const data = JSON.parse(proxy.content || "{}");
      const products = asArray(data.products).map(normalizeProduct).filter(Boolean);
      productsListCache = products;
      productsListCacheAt = Date.now();
      sendJson(res, 200, { ok: true, products });
      return;
    }

    if (pathname === "/api/orders" && method === "GET") {
      if (!testAdminAuth(req)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || 500) || 500));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);
      if (!(await testDbReady())) {
        sendJson(res, 503, { ok: false, error: "Database unavailable" });
        return;
      }
      const proxy = await dbProxy(`/orders?limit=${limit}&offset=${offset}`);
      if (proxy.status !== 200) throw new Error("Failed to load orders");
      const data = JSON.parse(proxy.content || "{}");
      sendJson(res, 200, {
        orders: asArray(data.orders),
        total: Number(data.total || asArray(data.orders).length),
        limit,
        offset
      });
      return;
    }

    if (pathname === "/api/orders" && method === "POST") {
      if (!testOrderRate()) {
        sendJson(res, 429, { ok: false, error: "Too many requests" });
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req, 65536));
      } catch (error) {
        sendJson(res, error.status || 400, { ok: false, error: error.message || "Bad JSON" });
        return;
      }
      const order = body?.order;
      if (!order) {
        sendJson(res, 400, { ok: false, error: "Missing order" });
        return;
      }
      let name = String(order.customer?.name || "").trim();
      if (name.length > 80) name = name.slice(0, 80);
      const phone = normalizePhoneDigits(order.customer?.phone);
      if (name.length < 2 || !/^7\d{10}$/.test(phone)) {
        sendJson(res, 400, { ok: false, error: "Name and phone required" });
        return;
      }
      const isBooking =
        String(order.kind) === "booking" || String(order.channel) === "booking";
      const channel = isBooking
        ? "booking"
        : String(order.channel) === "telegram"
          ? "telegram"
          : "whatsapp";
      let id = String(order.id || "").trim();
      if (!testClientOrderId(id, isBooking ? "booking" : "order")) {
        id = newSecureOrderId(isBooking ? "booking" : "order");
      }

      const catalog = await getProductsList();
      const catalogMap = new Map(catalog.map((item) => [String(item.id), item]));

      let bookingDate = "";
      let bookingTime = "";
      let bookingProcedure = "";
      let bookingNote = "";
      if (isBooking) {
        bookingDate = String(order.booking?.date || "").trim();
        bookingTime = String(order.booking?.time || "").trim();
        bookingProcedure = String(order.booking?.procedure || "").trim();
        bookingNote = String(order.booking?.note || "").trim().slice(0, 200);
        if (!bookingDate || !bookingTime || !bookingProcedure) {
          sendJson(res, 400, { ok: false, error: "Procedure, date and time required" });
          return;
        }
        if (!BOOKING_TIME_SLOTS.includes(bookingTime) || !testBookingDateValid(bookingDate, bookingTime)) {
          sendJson(res, 400, { ok: false, error: "Invalid date or time" });
          return;
        }
        let procedureOk = BOOKING_PROCEDURE_NAMES.includes(bookingProcedure);
        if (!procedureOk) {
          procedureOk = catalog.some(
            (product) =>
              product.type === "service" && String(product.name).trim() === bookingProcedure
          );
        }
        if (!procedureOk) {
          sendJson(res, 400, { ok: false, error: "Unknown procedure" });
          return;
        }
      }

      const items = [];
      if (isBooking) {
        items.push({
          id: "booking",
          type: "service",
          name: bookingProcedure,
          price: 0,
          quantity: 1,
          lineTotal: 0
        });
      } else {
        const rawItems = asArray(order.items);
        if (rawItems.length > 30) {
          sendJson(res, 400, { ok: false, error: "Too many items" });
          return;
        }
        for (const item of rawItems) {
          const qty = Number(item.quantity) || 0;
          if (qty < 1 || qty > 99) {
            sendJson(res, 400, { ok: false, error: "Invalid quantity" });
            return;
          }
          const itemId = String(item.id || "").trim();
          const catalogItem = catalogMap.get(itemId);
          if (!catalogItem) {
            sendJson(res, 400, { ok: false, error: "Unknown product" });
            return;
          }
          const price = Number(catalogItem.price);
          items.push({
            id: itemId,
            type: catalogItem.type === "service" ? "service" : "product",
            name: String(catalogItem.name).trim(),
            price,
            quantity: qty,
            lineTotal: price * qty
          });
        }
      }
      if (!items.length) {
        sendJson(res, 400, { ok: false, error: "Empty order" });
        return;
      }
      const total = items.reduce((sum, entry) => sum + Number(entry.lineTotal || 0), 0);
      const saved = {
        id,
        createdAt: new Date().toISOString(),
        status: "new",
        kind: isBooking ? "booking" : "order",
        channel,
        customer: {
          name,
          phone,
          phoneDisplay: formatPhoneDisplayRu(phone)
        },
        items,
        total,
        currency: "RUB"
      };
      if (isBooking) {
        saved.booking = {
          procedure: bookingProcedure,
          date: bookingDate,
          time: bookingTime,
          note: bookingNote
        };
      }

      if (!(await testDbReady())) {
        sendJson(res, 503, { ok: false, error: "Database unavailable", orderId: id });
        return;
      }
      const proxy = await dbProxy("/orders", {
        method: "POST",
        body: JSON.stringify({ order: saved }),
        headers: { "Content-Type": "application/json; charset=utf-8" },
        timeoutMs: 15000
      });
      clearProductsCache();
      const data = JSON.parse(proxy.content || "{}");
      if (proxy.status === 409) {
        sendJson(res, 409, {
          ok: false,
          error: data.error || "Slot already booked",
          productId: data.productId,
          available: data.available
        });
        return;
      }
      if (proxy.status === 400) {
        sendJson(res, 400, { ok: false, error: data.error || "Invalid data" });
        return;
      }
      if (proxy.status === 503) {
        sendJson(res, 503, {
          ok: false,
          error: data.error || "Database unavailable",
          orderId: id
        });
        return;
      }
      if (proxy.status < 200 || proxy.status >= 300 || !data.order) {
        sendJson(res, 500, {
          ok: false,
          error: data.error || "Server error",
          orderId: id
        });
        return;
      }

      const orderOut = data.order;
      const idempotentHit = Boolean(data.idempotent);
      let telegramOk = false;
      if (idempotentHit) {
        const prev = getTelegramNotified(String(orderOut.id));
        if (prev != null) telegramOk = prev;
        else {
          telegramOk = false;
          addTelegramOutbox(orderOut);
        }
      } else {
        telegramOk = await sendTelegramOrderNotify(orderOut);
        setTelegramNotified(String(orderOut.id), telegramOk);
        if (!telegramOk) addTelegramOutbox(orderOut);
      }

      const response = {
        ok: true,
        telegramNotify: telegramOk,
        idempotent: idempotentHit,
        order: orderOut
      };
      if (data.products) {
        response.products = asArray(data.products).map(normalizeProduct).filter(Boolean);
      }
      if (data.revision != null) response.revision = Number(data.revision);
      sendJson(res, idempotentHit ? 200 : 201, response);
      return;
    }

    if (pathname === "/api/orders" && method === "PATCH") {
      if (!testAdminAuth(req)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      const body = JSON.parse(await readBody(req));
      const orderId = String(body.id || "");
      const status = String(body.status || "");
      if (!orderId || !["new", "in_progress", "done", "cancelled"].includes(status)) {
        sendJson(res, 400, { ok: false, error: "Invalid data" });
        return;
      }
      const proxy = await dbProxy("/orders", {
        method: "PATCH",
        body: JSON.stringify({ id: orderId, status }),
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
      const data = JSON.parse(proxy.content || "{}");
      if (proxy.status === 404) {
        sendJson(res, 404, { ok: false, error: "Order not found" });
        return;
      }
      if (proxy.status === 409) {
        sendJson(res, 409, { ok: false, error: data.error || "Insufficient stock" });
        return;
      }
      if (proxy.status !== 200 || !data.order) {
        sendJson(res, 500, { ok: false, error: "Server error" });
        return;
      }
      clearProductsCache();
      const response = { ok: true, order: data.order };
      if (data.products) {
        response.products = asArray(data.products).map(normalizeProduct).filter(Boolean);
      }
      if (data.revision != null) response.revision = Number(data.revision);
      sendJson(res, 200, response);
      return;
    }

    if (pathname === "/api/orders" && method === "DELETE") {
      if (!testAdminAuth(req)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      let orderId = url.searchParams.get("id");
      if (!orderId) {
        const body = JSON.parse((await readBody(req)) || "{}");
        orderId = String(body.id || "");
      }
      if (!orderId) {
        sendJson(res, 400, { ok: false, error: "Missing id" });
        return;
      }
      const proxy = await dbProxy(`/orders?id=${encodeURIComponent(orderId)}`, {
        method: "DELETE"
      });
      const data = JSON.parse(proxy.content || "{}");
      if (proxy.status !== 200) {
        sendJson(res, 500, { ok: false, error: "Server error" });
        return;
      }
      clearProductsCache();
      const response = { ok: true };
      if (data.products) {
        response.products = asArray(data.products).map(normalizeProduct).filter(Boolean);
      }
      if (data.revision != null) response.revision = Number(data.revision);
      sendJson(res, 200, response);
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }

    serveStatic(req, res, pathname);
    console.log(`${method} ${pathname}`);
  } catch (error) {
    console.log(`ERROR ${method} ${pathname}: ${error.message}`);
    if (!res.writableEnded) {
      sendJson(res, error.status || 500, { ok: false, error: "Server error" });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Gateway on http://${HOST}:${PORT}/`);
  console.log(`Static root: ${STATIC_ROOT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Env file: ${ENV_FILE}`);
  console.log(`DB upstream: http://${DB_HOST}:${DB_PORT}`);
  console.log(`AI upstream: http://${AI_HOST}:${AI_PORT}`);
  console.log(`PDF upstream: http://${PDF_HOST}:${PDF_PORT}`);
});

server.on("error", (error) => {
  console.error("Gateway listen failed:", error.message || error);
  process.exit(1);
});

const shutdown = () => {
  console.log("Gateway shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
