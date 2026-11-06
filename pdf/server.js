import http from "node:http";
import express from "express";
import cors from "cors";
import PdfPrinter from "pdfmake";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadClinic } from "./lib/clinic.js";
import { escapeFilePart } from "./lib/format.js";
import { htmlToPdf, closeBrowser } from "./lib/browser.js";
import { buildInvoiceDoc } from "./templates/invoice.js";
import { buildCatalogDoc } from "./templates/catalog.js";
import { renderCatalogHtml } from "./templates/catalogHtml.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.JARVIS_PDF_HOST || process.env.JARVIS_HOST || "127.0.0.1";
const PORT = Number(process.env.JARVIS_PDF_PORT || 5602);
const DB_HOST = process.env.JARVIS_DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.JARVIS_DB_PORT || 5601);
const DATA_DIR = process.env.JARVIS_DATA_DIR || "";
const PROJECT_ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, "..");

const vfsModule = require("pdfmake/build/vfs_fonts.js");
const vfs = vfsModule.pdfMake?.vfs || vfsModule.vfs || vfsModule;

const printer = new PdfPrinter({
  Roboto: {
    normal: Buffer.from(vfs["Roboto-Regular.ttf"], "base64"),
    bold: Buffer.from(vfs["Roboto-Medium.ttf"], "base64"),
    italics: Buffer.from(vfs["Roboto-Italic.ttf"], "base64"),
    bolditalics: Buffer.from(vfs["Roboto-MediumItalic.ttf"], "base64")
  }
});

const app = express();
// Local-only service: allow same-machine callers, not arbitrary websites.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const host = new URL(origin).hostname;
        if (host === "127.0.0.1" || host === "localhost") return callback(null, true);
      } catch {
        // reject
      }
      return callback(null, false);
    }
  })
);
app.use(express.json({ limit: "2mb" }));

const sendJson = (res, status, object) => {
  res.status(status).json(object);
};

const createPdfBuffer = (docDefinition) =>
  new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    } catch (error) {
      reject(error);
    }
  });

async function fetchDb(pathname) {
  const url = `http://${DB_HOST}:${DB_PORT}${pathname}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error((data && data.error) || `DB HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function findOrder(id) {
  const wanted = String(id || "").trim();
  if (!wanted) return null;

  try {
    const byId = await fetchDb(`/orders/${encodeURIComponent(wanted)}`);
    if (byId?.order) return byId.order;
  } catch (error) {
    if (Number(error?.status) === 404 && /order not found/i.test(String(error.message || ""))) {
      return null;
    }
  }

  const page = await fetchDb("/orders?limit=5000&offset=0");
  const orders = Array.isArray(page?.orders) ? page.orders : Array.isArray(page) ? page : [];
  return orders.find((order) => String(order.id) === wanted) || null;
}

function normalizeProducts(payload) {
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function renderCatalogPdf(products, clinic, typeFilter) {
  try {
    const html = renderCatalogHtml(products, clinic, typeFilter);
    return await htmlToPdf(html);
  } catch (error) {
    console.error("Puppeteer catalog failed, falling back to pdfmake:", error?.message || error);
    const doc = await buildCatalogDoc(products, clinic, { typeFilter });
    return createPdfBuffer(doc);
  }
}

app.get("/health", (_req, res) => {
  sendJson(res, 200, {
    ok: true,
    service: "pdf",
    port: PORT,
    dbPort: DB_PORT,
    catalogEngine: "puppeteer+html"
  });
});

app.get("/orders/:id", async (req, res) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) {
      sendJson(res, 404, { ok: false, error: "Order not found" });
      return;
    }

    const clinic = loadClinic(DATA_DIR, PROJECT_ROOT);
    const doc = buildInvoiceDoc(order, clinic);
    const buffer = await createPdfBuffer(doc);
    const filename = `order_${escapeFilePart(order.id)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (error) {
    console.error("PDF order error:", error?.message || error);
    sendJson(res, Number(error?.status) || 500, {
      ok: false,
      error: "Failed to generate PDF"
    });
  }
});

app.get("/catalog", async (req, res) => {
  try {
    const typeRaw = String(req.query.type || "all").toLowerCase();
    const typeFilter = typeRaw === "product" || typeRaw === "service" ? typeRaw : "all";

    const payload = await fetchDb("/products");
    let products = normalizeProducts(payload);
    if (typeFilter !== "all") {
      products = products.filter((item) => String(item.type || "product") === typeFilter);
    }

    const clinic = loadClinic(DATA_DIR, PROJECT_ROOT);
    const buffer = await renderCatalogPdf(products, clinic, typeFilter);
    const filename = `catalog_${escapeFilePart(typeFilter)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (error) {
    console.error("Catalog PDF error:", error?.message || error);
    sendJson(res, Number(error?.status) || 500, {
      ok: false,
      error: "Failed to generate PDF"
    });
  }
});

app.use((_req, res) => {
  sendJson(res, 404, { ok: false, error: "Not found" });
});

const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`PDF service on http://${HOST}:${PORT}/`);
  console.log(`DB upstream: http://${DB_HOST}:${DB_PORT}/`);
});

server.on("error", (error) => {
  console.error("PDF service listen failed:", error?.message || error);
  process.exit(1);
});

const shutdown = async () => {
  try {
    await closeBrowser();
  } catch {
    // ignore
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
