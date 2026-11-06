import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_TEXT = 12000;
const MAX_FILE = 12 * 1024 * 1024;
const MAX_IMAGE = 12 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 20000;

const withTimeout = async (factory, ms, label) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(factory),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

export function classifyName(name, type) {
  const n = String(name || "").toLowerCase();
  const t = String(type || "").toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx") || t.includes("wordprocessingml")) return "docx";
  // SVG is XML text, not a vision bitmap — check before image/*.
  if (t.includes("svg") || n.endsWith(".svg") || t === "image/svg+xml") return "text";
  if (
    t.startsWith("text/") ||
    /\.(txt|md|csv|json|html?|xml|log|css|js|ts|rtf)$/i.test(n)
  ) {
    return "text";
  }
  if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(n)) return "image";
  return "other";
}

const decodeData = (file) => {
  let raw = String(file?.data || "").replace(/\s/g, "");
  if (!raw) return null;
  const comma = raw.indexOf(",");
  if (/^data:/i.test(raw) && comma >= 0) raw = raw.slice(comma + 1);
  if (!raw) return null;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
};

const visionMime = (name, type) => {
  const t = String(type || "").toLowerCase();
  if (t === "image/jpeg" || t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  if (t === "image/png") return "image/png";
  if (t === "image/gif") return "image/gif";
  if (t === "image/webp") return "image/webp";
  const n = String(name || "").toLowerCase();
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (/\.png$/.test(n)) return "image/png";
  if (/\.gif$/.test(n)) return "image/gif";
  if (/\.webp$/.test(n)) return "image/webp";
  return "";
};

const looksBinary = (buffer) => {
  const sample = buffer.subarray(0, 800);
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
};

const parsePdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await withTimeout(() => parser.getText({ pageJoiner: "" }), PARSE_TIMEOUT_MS, "pdf");
    return String(parsed?.text || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_TEXT);
  } finally {
    await parser.destroy().catch(() => {});
  }
};

const parseDocx = async (buffer) => {
  const parsed = await withTimeout(() => mammoth.extractRawText({ buffer }), PARSE_TIMEOUT_MS, "docx");
  return String(parsed?.value || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
};

export async function parseAttachment(file, { withImage = false, signal } = {}) {
  const name = String(file?.name || "file").slice(0, 120);
  const type = String(file?.type || "");
  const kind = classifyName(name, type);
  const buffer = decodeData(file);
  const size = buffer ? buffer.length : Number(file?.size || 0);
  const result = { name, type, kind, size, text: "", image: null, error: "" };

  if (signal?.aborted) {
    result.error = "aborted";
    result.text = `Файл «${name}» не разобран: запрос отменён.`;
    return result;
  }

  if (!buffer) {
    result.text = String(file?.text || "").trim().slice(0, MAX_TEXT);
    return result;
  }

  if (buffer.length > MAX_FILE) {
    result.error = "файл слишком большой";
    result.text = `Файл «${name}» больше 12 МБ и не разобран.`;
    return result;
  }

  try {
    if (kind === "image") {
      const mime = visionMime(name, type);
      if (withImage && mime && buffer.length <= MAX_IMAGE) {
        result.image = { mime, data: buffer.toString("base64") };
      }
      result.text = result.image
        ? `Пользователь прислал изображение «${name}» (${formatSize(size)}). Вы видите этот снимок.`
        : `Пользователь прислал изображение «${name}» (${formatSize(size)}). Формат нельзя показать как картинку.`;
      return result;
    }

    if (kind === "text") {
      result.text = buffer.toString("utf8").replace(/^\uFEFF/, "").slice(0, MAX_TEXT).trim();
      return result;
    }

    if (kind === "pdf") {
      result.text = await parsePdf(buffer);
      if (!result.text) result.text = `PDF «${name}» без извлекаемого текста.`;
      return result;
    }

    if (kind === "docx") {
      result.text = await parseDocx(buffer);
      if (!result.text) result.text = `Документ «${name}» без извлекаемого текста.`;
      return result;
    }

    if (!looksBinary(buffer)) {
      result.text = buffer.toString("utf8").replace(/^\uFEFF/, "").slice(0, MAX_TEXT).trim();
      if (result.text) return result;
    }

    result.text = `Файл «${name}» (${type || "неизвестный тип"}, ${formatSize(size)}) получен. Бинарное содержимое не разобрано.`;
  } catch (error) {
    result.error = String(error?.message || error).slice(0, 200);
    console.error("Jarvis file parse failed:", name, result.error);
    result.text = `Файл «${name}» не удалось полностью разобрать.`;
  }

  return result;
}
