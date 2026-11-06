/** 1×1 PNG placeholder */
const PLACEHOLDER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const FALLBACK = { content: PLACEHOLDER_PNG, format: "png" };
const MAX_BYTES = 1.5 * 1024 * 1024;
const cache = new Map();

function parseDataUrl(src) {
  const match = String(src || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  // pdfmake reliably supports jpeg/png; skip webp/gif/svg etc.
  if (!mime.includes("jpeg") && !mime.includes("jpg") && !mime.includes("png")) {
    return FALLBACK;
  }
  const content = match[2].replace(/\s+/g, "");
  const bytes = Buffer.from(content, "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) return FALLBACK;
  return { content, format: mime.includes("png") ? "png" : "jpeg" };
}

function sniffFormat(buffer, mimeHint = "") {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  // RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45
  ) {
    return null;
  }
  const hint = String(mimeHint || "").toLowerCase();
  if (hint.includes("png")) return "png";
  if (hint.includes("jpeg") || hint.includes("jpg")) return "jpeg";
  return null;
}

async function fetchAsImage(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/jpeg,image/png,image/*;q=0.8" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const mime = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error("Image too large");
    const format = sniffFormat(buffer, mime);
    if (!format) throw new Error("Unsupported image format");
    return { content: buffer.toString("base64"), format };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveImage(src) {
  const raw = String(src || "").trim();
  if (!raw) return FALLBACK;
  if (cache.has(raw)) return cache.get(raw);

  try {
    const dataUrl = parseDataUrl(raw);
    if (dataUrl) {
      cache.set(raw, dataUrl);
      return dataUrl;
    }

    if (/^https?:\/\//i.test(raw)) {
      const image = await fetchAsImage(raw);
      cache.set(raw, image);
      return image;
    }
  } catch {
    // fall through to placeholder
  }

  cache.set(raw, FALLBACK);
  return FALLBACK;
}
