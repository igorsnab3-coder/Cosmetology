import http from "node:http";
import {
  openStore,
  getStatus,
  getCatalogRevision,
  listProducts,
  replaceProducts,
  listOrders,
  getOrderById,
  insertOrder,
  updateOrderStatus,
  deleteOrder,
  flushStore
} from "./store.js";

const HOST = process.env.JARVIS_DB_HOST || process.env.JARVIS_HOST || "127.0.0.1";
const PORT = Number(process.env.JARVIS_DB_PORT || 5601);
const DB_FILE = process.env.JARVIS_DB_FILE || "";
const DATA_DIR = process.env.JARVIS_DATA_DIR || "";
const MAX_BODY = 32 * 1024 * 1024;

/** Serialize mutating requests so concurrent POSTs cannot race after await readBody. */
let writeChain = Promise.resolve();
const withWriteLock = (fn) => {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

const sendJson = (res, status, object, extraHeaders = {}) => {
  const body = Buffer.from(JSON.stringify(object), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    ...extraHeaders
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const error = new Error("Payload too large");
        error.status = 413;
        req.destroy();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const mapError = (error) => {
  const code = error?.code;
  if (code === "bad_request") return { status: 400, error: error.message || "Invalid data" };
  if (code === "not_found") return { status: 404, error: "Order not found" };
  if (code === "slot_taken") {
    return { status: 409, error: "Slot already booked", existingId: error.existingId || null };
  }
  if (code === "insufficient_stock") {
    return {
      status: 409,
      error: "Insufficient stock",
      productId: error.productId || null,
      available: Number.isFinite(Number(error.available)) ? Number(error.available) : null
    };
  }
  if (code === "id_conflict") {
    return { status: 409, error: "Order id conflict" };
  }
  if (code === "persist_failed" || code === "db_corrupt") {
    return { status: 503, error: "Database unavailable" };
  }
  return { status: 500, error: "Server error" };
};

const parsePage = (url) => {
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit = limitRaw != null && limitRaw !== "" ? Number(limitRaw) : null;
  const offset = offsetRaw != null && offsetRaw !== "" ? Number(offsetRaw) : 0;
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0
  };
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}`);
  const method = (req.method || "GET").toUpperCase();

  try {
    if (method === "GET" && url.pathname === "/health") {
      const status = getStatus();
      sendJson(res, status.ok ? 200 : 503, status);
      return;
    }

    if (method === "POST" && url.pathname === "/flush") {
      await withWriteLock(() => flushStore());
      sendJson(res, 200, { ok: true, flushed: true, ...getStatus() });
      return;
    }

    if (method === "GET" && url.pathname === "/products") {
      const revision = getCatalogRevision();
      const etag = `W/"cat-${revision}"`;
      const inm = String(req.headers["if-none-match"] || "");
      if (inm && inm === etag) {
        res.writeHead(304, {
          ETag: etag,
          "Cache-Control": "no-cache",
          "X-Catalog-Revision": String(revision)
        });
        res.end();
        return;
      }
      sendJson(
        res,
        200,
        { products: listProducts(), revision },
        { ETag: etag, "Cache-Control": "no-cache", "X-Catalog-Revision": String(revision) }
      );
      return;
    }

    if (method === "PUT" && url.pathname === "/products") {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const options = {
        preserveStock: payload.preserveStock !== false,
        allowEmpty: payload.allowEmpty === true,
        stockOverrides: Array.isArray(payload.stockOverrides) ? payload.stockOverrides : []
      };
      if (payload.preserveStock === false) options.preserveStock = false;
      const products = await withWriteLock(() => replaceProducts(payload.products, options));
      const revision = getCatalogRevision();
      sendJson(
        res,
        200,
        { ok: true, products, revision },
        { ETag: `W/"cat-${revision}"`, "X-Catalog-Revision": String(revision) }
      );
      return;
    }

    if (method === "GET" && url.pathname === "/orders") {
      const page = parsePage(url);
      const result = listOrders(page.limit ? page : {});
      sendJson(res, 200, {
        orders: result.orders,
        total: result.total,
        limit: result.limit,
        offset: result.offset
      });
      return;
    }

    if (method === "GET" && url.pathname.startsWith("/orders/")) {
      const id = decodeURIComponent(url.pathname.slice("/orders/".length)).trim();
      if (!id || id.includes("/")) {
        sendJson(res, 400, { ok: false, error: "Missing id" });
        return;
      }
      const order = getOrderById(id);
      if (!order) {
        sendJson(res, 404, { ok: false, error: "Order not found" });
        return;
      }
      sendJson(res, 200, { order });
      return;
    }

    if (method === "POST" && url.pathname === "/orders") {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const result = await withWriteLock(() => insertOrder(payload.order));
      sendJson(res, result.idempotent ? 200 : 201, {
        ok: true,
        idempotent: Boolean(result.idempotent),
        order: result.order,
        products: Array.isArray(result.products) ? result.products : undefined,
        revision: result.revision
      });
      return;
    }

    if (method === "PATCH" && url.pathname === "/orders") {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const result = await withWriteLock(() => updateOrderStatus(payload.id, payload.status));
      sendJson(res, 200, {
        ok: true,
        order: result.order,
        products: Array.isArray(result.products) ? result.products : undefined,
        revision: result.revision,
        stockChanged: Boolean(result.stockChanged)
      });
      return;
    }

    if (method === "DELETE" && url.pathname === "/orders") {
      const id = url.searchParams.get("id");
      if (!id) {
        sendJson(res, 400, { ok: false, error: "Missing id" });
        return;
      }
      const result = await withWriteLock(() => deleteOrder(id));
      sendJson(res, 200, {
        ok: true,
        products: Array.isArray(result.products) ? result.products : undefined,
        revision: result.revision,
        stockChanged: Boolean(result.stockChanged)
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    if (error?.status === 413) {
      sendJson(res, 413, { ok: false, error: "Payload too large" });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON" });
      return;
    }
    const mapped = mapError(error);
    if (mapped.status >= 500) {
      console.error("DB error:", error?.message || error);
    }
    sendJson(res, mapped.status, {
      ok: false,
      error: mapped.error,
      ...(mapped.existingId ? { existingId: mapped.existingId } : {}),
      ...(mapped.productId ? { productId: mapped.productId } : {}),
      ...(mapped.available != null ? { available: mapped.available } : {})
    });
  }
});

server.on("error", (error) => {
  console.error("DB listen failed:", error?.message || error);
  process.exit(1);
});

const shutdown = (signal) => {
  try {
    flushStore();
  } catch (error) {
    console.error("DB flush failed:", error?.message || error);
  }
  console.log(`DB shutdown (${signal})`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error("DB crash:", error);
  try {
    flushStore();
  } catch {
    // ignore
  }
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("DB rejection:", error);
  try {
    flushStore();
  } catch {
    // ignore
  }
  process.exit(1);
});

if (!DB_FILE) {
  console.error("JARVIS_DB_FILE is required");
  process.exit(1);
}

const info = await openStore({ dbFile: DB_FILE, dataDir: DATA_DIR });
server.listen(PORT, HOST, () => {
  console.log(`SQLite DB on http://${HOST}:${PORT}/`);
  console.log(`DB file: ${info.dbFile}`);
  console.log(`Light scale: cache+etag rev=${info.revision}, write-queue, order pages`);
  if (info.migrated?.products || info.migrated?.orders) {
    console.log(
      `Migrated from JSON: products=${info.migrated.products}, orders=${info.migrated.orders}`
    );
  }
});
