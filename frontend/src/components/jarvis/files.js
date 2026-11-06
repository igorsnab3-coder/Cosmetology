import { findConcern, normalize, WELCOME } from "./brain.js";

export const MAX_FILES = 4;
export const MAX_FILE_SIZE = 12 * 1024 * 1024;
export const MAX_TOTAL_FILE_SIZE = 15 * 1024 * 1024;

const scriptWaiters = new Map();

function loadScript(src) {
  const existing = [...document.scripts].find((script) => script.src === src);
  if (existing && existing.dataset.jarvisReady === "1") return Promise.resolve();
  if (existing?.dataset.jarvisFailed === "1") {
    existing.remove();
  }
  if (scriptWaiters.has(src)) return scriptWaiters.get(src);

  const pending = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    const settleOk = () => {
      el.dataset.jarvisReady = "1";
      scriptWaiters.delete(src);
      resolve();
    };
    const settleErr = () => {
      el.dataset.jarvisFailed = "1";
      scriptWaiters.delete(src);
      el.remove();
      reject(new Error("Не удалось загрузить библиотеку"));
    };
    el.addEventListener("load", settleOk, { once: true });
    el.addEventListener("error", settleErr, { once: true });
    el.src = src;
    el.async = true;
    el.crossOrigin = "anonymous";
    document.head.appendChild(el);
  });

  scriptWaiters.set(src, pending);
  return pending;
}

const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    })
  ]);
};

export const formatSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
};

export const classifyFile = (file) => {
  const name = file.name || "файл";
  const type = file.type || "";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/\.docx$/i.test(name)) return "docx";
  if (type.includes("svg") || /\.svg$/i.test(name)) return "text";
  if (type.startsWith("text/") || /\.(txt|md|csv|json|html?|xml|log|css|js|ts|rtf)$/i.test(name)) return "text";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name)) return "image";
  return "other";
};

export const imageSize = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });

const excerpt = (text, query) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = normalize(query).split(" ").filter((word) => word.length > 3);
  if (!words.length) return clean.slice(0, 1000);
  const picked = clean
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => ({ chunk, n: words.filter((word) => normalize(chunk).includes(word)).length }))
    .sort((a, b) => b.n - a.n)
    .filter((item) => item.n > 0)
    .slice(0, 5)
    .map((item) => item.chunk);
  return (picked.length ? picked.join(" ") : clean).slice(0, 1000);
};

async function extractPdf(file) {
  const run = async () => {
    if (!window.pdfjsLib) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const parts = [];
    for (let i = 1; i <= Math.min(doc.numPages, 12); i += 1) {
      const content = await (await doc.getPage(i)).getTextContent();
      parts.push(content.items.map((item) => item.str).join(" "));
    }
    return parts.join("\n").replace(/\s+/g, " ").trim().slice(0, 20000);
  };
  return withTimeout(run(), 20000);
}

async function extractDocx(file) {
  const run = async () => {
    if (!window.JSZip) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    }
    const zip = await withTimeout(window.JSZip.loadAsync(await file.arrayBuffer()), 15000);
    const doc = zip.file("word/document.xml");
    if (!doc) throw new Error("empty");
    const xml = await doc.async("string");
    return xml
      .replace(/<w:tab[^/]*\/>/g, " ")
      .replace(/<w:p[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000);
  };
  return withTimeout(run(), 20000);
}

let tessWorker = null;

async function extractImageText(file) {
  try {
    if (!window.Tesseract) {
      await withTimeout(
        loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"),
        12000
      );
    }
    if (!tessWorker) {
      tessWorker = await withTimeout(window.Tesseract.createWorker("rus+eng"), 20000);
    }
    const result = await withTimeout(tessWorker.recognize(file), 18000);
    return String(result?.data?.text || "").replace(/\s+/g, " ").trim();
  } catch (error) {
    tessWorker = null;
    return "";
  }
}

export async function readAttachment(item) {
  const entry = {
    name: item.name,
    type: item.type,
    size: item.size,
    kind: item.kind,
    preview: item.preview,
    text: "",
    width: item.width || 0,
    height: item.height || 0,
    error: ""
  };

  if (item.file.size > MAX_FILE_SIZE) {
    entry.error = "файл больше 12 МБ";
    return entry;
  }

  try {
    if (item.kind === "image") {
      const ocr = await extractImageText(item.file);
      if (ocr.length > 8) entry.text = ocr.slice(0, 8000);
    } else if (item.kind === "text") {
      entry.text = (await item.file.text()).slice(0, 20000);
    } else if (item.kind === "pdf") {
      entry.text = await extractPdf(item.file);
    } else if (item.kind === "docx") {
      entry.text = await extractDocx(item.file);
    } else {
      const raw = await item.file.text();
      const sample = raw.slice(0, 400);
      const binary = sample.includes("\0") || sample.includes("\uFFFD");
      if (!binary && sample.replace(/\s/g, "").length > 8) {
        entry.text = raw.slice(0, 20000);
      } else {
        entry.text = `Attached file ${item.name} (${item.type || "unknown type"}, ${formatSize(item.size)}). Binary contents were not extracted.`;
      }
    }
  } catch (error) {
    entry.error = "не удалось извлечь содержимое";
    entry.text = `Attached file ${item.name} (${item.type || "unknown type"}, ${formatSize(item.size)}).`;
  }
  return entry;
}

function answerFiles(brain, question, files) {
  const parts = files.map((file) => {
    if (file.kind === "image") {
      const geo = file.width && file.height ? `${file.width}×${file.height}` : formatSize(file.size);
      if (file.text) {
        return `Я просмотрел изображение **${file.name}** (${geo}) и прочитал на нём текст:\n«${excerpt(file.text, question)}»`;
      }
      return (
        `Я получил изображение **${file.name}** (${geo}). ` +
        `По фото нельзя поставить диагноз — состояние кожи оценит Яна Сергеевна на консультации. ` +
        `Напишите, что беспокоит, и я подскажу направление.`
      );
    }
    if (file.text) return `Я прочитал файл **${file.name}**.\n\n${excerpt(file.text, question)}`;
    if (file.error) return `Файл **${file.name}** не удалось прочитать: ${file.error}.`;
    return `Файл **${file.name}** (${formatSize(file.size)}) получен.`;
  });

  const blob = normalize(`${question} ${files.map((file) => `${file.name} ${file.text || ""}`).join(" ")}`);
  const concern = findConcern(blob);
  if (concern) parts.push(brain.recommendForConcern(concern));
  return parts.join("\n\n");
}

export function think(brain, raw, files = []) {
  if (!files.length) return brain.thinkText(raw);

  const fileReply = answerFiles(brain, raw, files);
  if (!normalize(raw)) return fileReply;
  const follow = brain.thinkText(raw);
  const skipFollow =
    follow === WELCOME || follow.startsWith("Я консультант кабинета") || follow.startsWith("Напишите вопрос");
  return skipFollow ? fileReply : `${fileReply}\n\n${follow}`;
}
