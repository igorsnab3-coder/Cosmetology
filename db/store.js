import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import initSqlJs from "sql.js";

let SQL = null;
let db = null;
let dbPath = null;
let dataDirPath = null;

/** In-memory catalog cache — avoids re-scanning SQLite on every GET. */
let productsCache = null;
/** Bumps when catalog/stock changes; used for ETag / 304. */
let catalogRevision = 1;
let writesSinceBackup = 0;
const BACKUP_EVERY_WRITES = 25;
const SQLITE_HEADER = "SQLite format 3";

/** Disk write failed after in-memory COMMIT — memory/disk out of sync until recover. */
let dirty = false;
let lastPersistError = null;

const PRODUCT_COLS = "id, type, name, description, price, image, sort_order, stock";

function bumpCatalog() {
  catalogRevision += 1;
  productsCache = null;
}

function assertSqliteHeader(buf, label = "database") {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (bytes.length < 100) {
    const error = new Error(`CRITICAL: ${label} is empty or too small to be SQLite`);
    error.code = "db_corrupt";
    throw error;
  }
  const header = bytes.subarray(0, 15).toString("latin1");
  if (header !== SQLITE_HEADER) {
    const error = new Error(`CRITICAL: ${label} is not a valid SQLite database (bad header)`);
    error.code = "db_corrupt";
    throw error;
  }
  return bytes;
}

function reloadDatabaseFromSnapshot(snapshot) {
  if (!SQL) throw new Error("SQL runtime is not initialized");
  const next = new SQL.Database(snapshot);
  try {
    db?.close?.();
  } catch {
    // previous handle may already be unusable
  }
  db = next;
  bumpCatalog();
}

function persist({ forceBackup = false } = {}) {
  if (!db || !dbPath) return;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${dbPath}.tmp`;
  const bak = `${dbPath}.bak`;
  const data = db.export();
  assertSqliteHeader(data, "in-memory export");
  fs.writeFileSync(tmp, Buffer.from(data));
  writesSinceBackup += 1;
  const shouldBackup = forceBackup || writesSinceBackup >= BACKUP_EVERY_WRITES || !fs.existsSync(bak);
  if (shouldBackup && fs.existsSync(dbPath)) {
    try {
      const current = fs.readFileSync(dbPath);
      assertSqliteHeader(current, dbPath);
      fs.copyFileSync(dbPath, bak);
      writesSinceBackup = 0;
    } catch (error) {
      console.error("DB backup skipped (source not safe to copy):", error?.message || error);
      // Do not clobber a good .bak with a bad/unreadable live file.
    }
  }
  fs.renameSync(tmp, dbPath);
  dirty = false;
  lastPersistError = null;
}

/**
 * Snapshot memory → COMMIT → persist. On disk failure, restore snapshot.
 * dirty stays true only if restore itself fails (memory/disk truly diverge).
 */
function commitAndPersist(runInTxn, { bump = false, mirrorProducts = false, mirrorOrders = true } = {}) {
  if (dirty) {
    const error = new Error("Database is dirty after a failed disk write; refusing new mutations");
    error.code = "persist_failed";
    throw error;
  }
  const snapshot = db.export();
  exec("BEGIN");
  try {
    runInTxn();
    exec("COMMIT");
  } catch (error) {
    try {
      exec("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }

  try {
    persist();
  } catch (error) {
    lastPersistError = String(error?.message || error).slice(0, 300);
    console.error("CRITICAL: persist failed after COMMIT, restoring memory snapshot:", lastPersistError);
    try {
      reloadDatabaseFromSnapshot(snapshot);
      // Memory matches disk again (pre-txn). Mutation was not durable — caller gets 503 and may retry.
      dirty = false;
    } catch (restoreError) {
      dirty = true;
      console.error("CRITICAL: failed to restore DB snapshot:", restoreError?.message || restoreError);
    }
    const wrapped = new Error("persist failed");
    wrapped.code = "persist_failed";
    wrapped.cause = error;
    throw wrapped;
  }

  // Only bump/mirror after durable persist succeeded.
  if (bump) bumpCatalog();
  if (mirrorProducts) mirrorProductsJson();
  if (mirrorOrders) mirrorOrdersJson();
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function mirrorProductsJson() {
  if (!dataDirPath) return;
  try {
    writeJsonAtomic(path.join(dataDirPath, "products.json"), listProducts());
  } catch {
    // AI mirror is best-effort
  }
}

function mirrorOrdersJson() {
  if (!dataDirPath) return;
  try {
    // Full mirror (no page cap) — used for disaster recovery / AI context.
    writeJsonAtomic(path.join(dataDirPath, "orders.json"), listOrders().orders);
  } catch {
    // disaster-recovery mirror is best-effort
  }
}

/** Force SQLite .bak + refresh JSON mirrors. Safe under serve.ps1 Kill(). */
export function flushStore() {
  if (dirty) {
    const error = new Error("Refusing flush while DB is dirty");
    error.code = "persist_failed";
    throw error;
  }
  mirrorProductsJson();
  mirrorOrdersJson();
  persist({ forceBackup: true });
}

export function getCatalogRevision() {
  return catalogRevision;
}

function exec(sql) {
  db.run(sql);
}

function tableExists(name) {
  const stmt = db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
  );
  stmt.bind([name]);
  const ok = stmt.step();
  stmt.free();
  return ok;
}

function ensureColumn(table, column, ddl) {
  const cols = queryAll(`PRAGMA table_info(${table})`);
  if (cols.some((col) => String(col.name) === column)) return;
  exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function migrateSchema() {
  exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'product',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL,
      image TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      stock INTEGER
    );
  `);
  exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      kind TEXT NOT NULL DEFAULT 'order',
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_phone_display TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RUB',
      booking_procedure TEXT,
      booking_date TEXT,
      booking_time TEXT,
      booking_note TEXT,
      items_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
  ensureColumn("products", "stock", "INTEGER");
  // Existing catalog rows: give products a starter stock; services stay unlimited (NULL).
  exec(`
    UPDATE products
    SET stock = 10
    WHERE type = 'product' AND stock IS NULL
  `);
  exec(`
    UPDATE products
    SET stock = NULL
    WHERE type = 'service'
  `);
  exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot
    ON orders(booking_date, booking_time)
    WHERE kind = 'booking'
      AND status != 'cancelled'
      AND booking_date IS NOT NULL
      AND booking_time IS NOT NULL;
  `);
  exec(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);`);
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeStock(type, value) {
  if (type === "service") return null;
  // Missing key (legacy rows) → starter stock; explicit 0 stays 0.
  if (value === undefined) return 10;
  if (value === null || value === "") return 0;
  const stock = Math.round(Number(value));
  if (!Number.isFinite(stock)) return 0;
  return Math.max(0, Math.min(99999, stock));
}

function normalizeProduct(item, index = 0) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name || "").trim();
  const image = String(item.image || "").trim();
  if (!name || !image) return null;
  const price = Math.round(Number(item.price));
  if (!Number.isFinite(price) || price <= 0) return null;
  const type = String(item.type || "") === "service" ? "service" : "product";
  return {
    id: String(item.id || `p${Date.now()}`),
    type,
    name,
    description: String(item.description || "").trim(),
    price,
    image,
    sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index,
    stock: normalizeStock(type, item.stock)
  };
}

function rowToProduct(row) {
  const type = row.type === "service" ? "service" : "product";
  return {
    id: row.id,
    type,
    name: row.name,
    description: row.description || "",
    price: Number(row.price) || 0,
    image: row.image,
    stock: type === "service" ? null : normalizeStock(type, row.stock)
  };
}

function rowToOrder(row) {
  let items = [];
  try {
    items = JSON.parse(row.items_json || "[]");
  } catch {
    items = [];
  }
  if (!Array.isArray(items)) items = [];
  const kind = row.kind === "booking" ? "booking" : "order";
  const order = {
    id: row.id,
    createdAt: row.created_at,
    status: row.status || "new",
    kind,
    channel: row.channel || (kind === "booking" ? "booking" : "whatsapp"),
    customer: {
      name: row.customer_name || "",
      phone: row.customer_phone || "",
      phoneDisplay: row.customer_phone_display || ""
    },
    items,
    total: Number(row.total) || 0,
    currency: row.currency || "RUB",
    booking: null
  };
  if (kind === "booking") {
    order.booking = {
      procedure: row.booking_procedure || "",
      date: row.booking_date || "",
      time: row.booking_time || "",
      note: row.booking_note || ""
    };
  }
  return order;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function countRows(table) {
  const row = queryOne(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(row?.c) || 0;
}

export function listProducts() {
  if (!productsCache) {
    productsCache = queryAll(
      `SELECT ${PRODUCT_COLS} FROM products ORDER BY sort_order ASC, name ASC`
    ).map(rowToProduct);
  }
  return productsCache.map((item) => ({ ...item }));
}

/**
 * Replace catalog. By default keeps live stock for existing product ids so a
 * stale admin tab cannot undo sales. Pass stockOverrides (id list) or
 * preserveStock:false when intentionally setting stock (single-product edit / seed).
 */
export function replaceProducts(products, options = {}) {
  const next = (Array.isArray(products) ? products : [])
    .map((item, index) => normalizeProduct(item, index))
    .filter(Boolean);

  if (!next.length && options.allowEmpty !== true) {
    const error = new Error("Catalog cannot be empty");
    error.code = "bad_request";
    throw error;
  }

  const preserveStock = options.preserveStock !== false;
  const overrideSet = new Set(
    (Array.isArray(options.stockOverrides) ? options.stockOverrides : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
  const currentById = new Map(listProducts().map((item) => [item.id, item]));

  commitAndPersist(
    () => {
      exec("DELETE FROM products");
      const stmt = db.prepare(
        `INSERT INTO products (${PRODUCT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      try {
        next.forEach((item, index) => {
          let stock = item.type === "service" ? null : normalizeStock("product", item.stock);
          if (item.type === "product" && preserveStock && currentById.has(item.id) && !overrideSet.has(item.id)) {
            stock = normalizeStock("product", currentById.get(item.id).stock);
          }
          stmt.run([
            item.id,
            item.type,
            item.name,
            item.description,
            item.price,
            item.image,
            item.sort_order ?? index,
            stock
          ]);
        });
      } finally {
        stmt.free();
      }
    },
    { bump: true, mirrorProducts: true, mirrorOrders: false }
  );
  return listProducts();
}

/**
 * @param {{ limit?: number, offset?: number }} [opts]
 * Without limit → all rows (compat). With limit → page + total.
 */
export function listOrders(opts = {}) {
  const hasLimit = Number.isFinite(Number(opts?.limit)) && Number(opts.limit) > 0;
  const limit = hasLimit ? Math.min(5000, Math.max(1, Math.round(Number(opts.limit)))) : null;
  const offset = Math.max(0, Math.round(Number(opts?.offset) || 0));
  const total = countRows("orders");

  if (!limit) {
    const orders = queryAll(`SELECT * FROM orders ORDER BY created_at DESC, id DESC`).map(rowToOrder);
    return { orders, total: orders.length, limit: null, offset: 0 };
  }

  const orders = queryAll(
    `SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  ).map(rowToOrder);
  return { orders, total, limit, offset };
}

export function getOrderById(id) {
  const row = queryOne(`SELECT * FROM orders WHERE id = ? LIMIT 1`, [String(id)]);
  return row ? rowToOrder(row) : null;
}

function createSecureOrderId(kind) {
  const prefix = kind === "booking" ? "book" : "ord";
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function isValidClientOrderId(id, kind) {
  const value = String(id || "").trim();
  if (kind === "booking") return /^book_[a-f0-9]{20,64}$/i.test(value);
  return /^ord_[a-f0-9]{20,64}$/i.test(value);
}

function orderIntentKey(order) {
  const kind = order?.kind === "booking" || order?.channel === "booking" ? "booking" : "order";
  const phone = String(order?.customer?.phone || "").trim();
  // Ignore price/total: catalog repricing between retry attempts must not look like a conflict.
  if (kind === "booking") {
    const booking = order?.booking || {};
    return `booking|${phone}|${String(booking.date || "")}|${String(booking.time || "")}|${String(booking.procedure || "")}`;
  }
  const items = (Array.isArray(order?.items) ? order.items : [])
    .map((item) => {
      const id = String(item?.id || "").trim();
      const qty = Math.max(1, Math.min(99, Number(item?.quantity) || 1));
      return `${id}:${qty}`;
    })
    .sort()
    .join("|");
  return `order|${phone}|${items}`;
}

export function insertOrder(order) {
  if (!order || typeof order !== "object") {
    const error = new Error("Missing order");
    error.code = "bad_request";
    throw error;
  }

  const kind = order.kind === "booking" || order.channel === "booking" ? "booking" : "order";
  let id = String(order.id || "").trim();
  if (!isValidClientOrderId(id, kind)) {
    id = createSecureOrderId(kind);
  }

  const existing = getOrderById(id);
  if (existing) {
    if (orderIntentKey(existing) !== orderIntentKey({ ...order, kind, id })) {
      const error = new Error("Order id conflict");
      error.code = "id_conflict";
      throw error;
    }
    return { order: existing, idempotent: true, created: false, products: listProducts(), revision: catalogRevision };
  }

  const status = "new";
  const channel =
    kind === "booking" ? "booking" : order.channel === "telegram" ? "telegram" : "whatsapp";
  const customer = order.customer || {};
  const booking = order.booking && typeof order.booking === "object" ? order.booking : {};
  const items = Array.isArray(order.items) ? order.items : [];
  const bookingDate = kind === "booking" ? String(booking.date || "").trim() : null;
  const bookingTime = kind === "booking" ? String(booking.time || "").trim() : null;

  // Shop orders must reference real catalog rows — never trust free-form lines.
  if (kind !== "booking") {
    for (const item of items) {
      const itemId = String(item?.id || "").trim();
      if (!itemId) {
        const error = new Error("Unknown product");
        error.code = "bad_request";
        throw error;
      }
      const product = queryOne(`SELECT id, type FROM products WHERE id = ? LIMIT 1`, [itemId]);
      if (!product) {
        const error = new Error("Unknown product");
        error.code = "bad_request";
        error.productId = itemId;
        throw error;
      }
    }
  }

  if (kind === "booking" && bookingDate && bookingTime) {
    const clash = queryOne(
      `SELECT id FROM orders
       WHERE kind = 'booking'
         AND status != 'cancelled'
         AND booking_date = ?
         AND booking_time = ?
       LIMIT 1`,
      [bookingDate, bookingTime]
    );
    if (clash) {
      const error = new Error("Slot already booked");
      error.code = "slot_taken";
      error.existingId = clash.id;
      throw error;
    }
  }

  try {
    commitAndPersist(
      () => {
        // Decrement stock for physical products only (services are unlimited).
        if (kind !== "booking") {
          for (const item of items) {
            const itemId = String(item?.id || "").trim();
            if (!itemId) {
              const error = new Error("Unknown product");
              error.code = "bad_request";
              throw error;
            }
            const qty = Math.max(1, Math.min(99, Number(item?.quantity) || 1));
            const product = queryOne(
              `SELECT id, type, stock FROM products WHERE id = ? LIMIT 1`,
              [itemId]
            );
            if (!product) {
              const error = new Error("Unknown product");
              error.code = "bad_request";
              error.productId = itemId;
              throw error;
            }
            if (product.type === "service") continue;
            const available = normalizeStock("product", product.stock);
            if (available < qty) {
              const error = new Error("Insufficient stock");
              error.code = "insufficient_stock";
              error.productId = itemId;
              error.available = available;
              throw error;
            }
            db.run(`UPDATE products SET stock = stock - ? WHERE id = ? AND type = 'product' AND stock >= ?`, [
              qty,
              itemId,
              qty
            ]);
            const after = queryOne(`SELECT stock FROM products WHERE id = ? LIMIT 1`, [itemId]);
            if (normalizeStock("product", after?.stock) !== available - qty) {
              const error = new Error("Insufficient stock");
              error.code = "insufficient_stock";
              error.productId = itemId;
              throw error;
            }
          }
        }

        db.run(
          `INSERT INTO orders (
            id, created_at, status, kind, channel,
            customer_name, customer_phone, customer_phone_display,
            total, currency,
            booking_procedure, booking_date, booking_time, booking_note,
            items_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            new Date().toISOString(),
            status,
            kind,
            channel,
            String(customer.name || "").trim().slice(0, 80),
            String(customer.phone || "").trim().slice(0, 20),
            String(customer.phoneDisplay || "").trim().slice(0, 32),
            Math.round(Number(order.total) || 0),
            "RUB",
            kind === "booking" ? String(booking.procedure || "").trim().slice(0, 120) : null,
            bookingDate,
            bookingTime,
            kind === "booking" ? String(booking.note || "").trim().slice(0, 200) : null,
            JSON.stringify(items)
          ]
        );
      },
      { bump: kind !== "booking", mirrorProducts: kind !== "booking", mirrorOrders: true }
    );
  } catch (error) {
    if (error?.code === "insufficient_stock" || error?.code === "bad_request" || error?.code === "persist_failed") {
      throw error;
    }
    const msg = String(error?.message || error);
    if (/UNIQUE|constraint/i.test(msg)) {
      const again = getOrderById(id);
      if (again) {
        if (orderIntentKey(again) !== orderIntentKey({ ...order, kind, id })) {
          const conflict = new Error("Order id conflict");
          conflict.code = "id_conflict";
          throw conflict;
        }
        return { order: again, idempotent: true, created: false, products: listProducts(), revision: catalogRevision };
      }
      const slotError = new Error("Slot already booked");
      slotError.code = "slot_taken";
      throw slotError;
    }
    throw error;
  }

  return {
    order: getOrderById(id),
    idempotent: false,
    created: true,
    products: listProducts(),
    revision: catalogRevision
  };
}

/** Physical products only — bookings never touch stock. */
function orderAffectsStock(order) {
  return order && order.kind !== "booking";
}

function restoreStockForItems(items) {
  let changed = false;
  for (const item of items || []) {
    const itemId = String(item?.id || "").trim();
    if (!itemId) continue;
    const qty = Math.max(1, Math.min(99, Number(item?.quantity) || 1));
    const product = queryOne(`SELECT id, type, stock FROM products WHERE id = ? LIMIT 1`, [itemId]);
    if (!product || product.type === "service") continue;
    const available = normalizeStock("product", product.stock);
    const next = Math.min(99999, available + qty);
    db.run(`UPDATE products SET stock = ? WHERE id = ? AND type = 'product'`, [next, itemId]);
    changed = true;
  }
  return changed;
}

function consumeStockForItems(items) {
  let changed = false;
  for (const item of items || []) {
    const itemId = String(item?.id || "").trim();
    if (!itemId) continue;
    const qty = Math.max(1, Math.min(99, Number(item?.quantity) || 1));
    const product = queryOne(`SELECT id, type, stock FROM products WHERE id = ? LIMIT 1`, [itemId]);
    if (!product || product.type === "service") continue;
    const available = normalizeStock("product", product.stock);
    if (available < qty) {
      const error = new Error("Insufficient stock");
      error.code = "insufficient_stock";
      error.productId = itemId;
      error.available = available;
      throw error;
    }
    db.run(`UPDATE products SET stock = stock - ? WHERE id = ? AND type = 'product' AND stock >= ?`, [
      qty,
      itemId,
      qty
    ]);
    const after = queryOne(`SELECT stock FROM products WHERE id = ? LIMIT 1`, [itemId]);
    if (normalizeStock("product", after?.stock) !== available - qty) {
      const error = new Error("Insufficient stock");
      error.code = "insufficient_stock";
      error.productId = itemId;
      throw error;
    }
    changed = true;
  }
  return changed;
}

export function updateOrderStatus(id, status) {
  const allowed = new Set(["new", "in_progress", "done", "cancelled"]);
  if (!allowed.has(status)) {
    const error = new Error("Invalid data");
    error.code = "bad_request";
    throw error;
  }
  const current = getOrderById(id);
  if (!current) {
    const error = new Error("Order not found");
    error.code = "not_found";
    throw error;
  }

  const prev = current.status || "new";
  if (prev === status) {
    return { order: current, products: listProducts(), revision: catalogRevision, stockChanged: false };
  }

  const becomingCancelled = status === "cancelled" && prev !== "cancelled";
  const leavingCancelled = prev === "cancelled" && status !== "cancelled";
  const mayTouchStock = orderAffectsStock(current) && (becomingCancelled || leavingCancelled);
  let stockChanged = false;

  commitAndPersist(
    () => {
      if (orderAffectsStock(current)) {
        if (becomingCancelled) {
          stockChanged = restoreStockForItems(current.items) || stockChanged;
        } else if (leavingCancelled) {
          stockChanged = consumeStockForItems(current.items) || stockChanged;
        }
      }
      db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, String(id)]);
    },
    { bump: mayTouchStock, mirrorProducts: mayTouchStock, mirrorOrders: true }
  );

  return {
    order: getOrderById(id),
    products: listProducts(),
    revision: catalogRevision,
    stockChanged
  };
}

export function deleteOrder(id) {
  const current = getOrderById(id);
  const reserved = current && (current.status === "new" || current.status === "in_progress");
  const mayTouchStock = Boolean(current && orderAffectsStock(current) && reserved);
  let stockChanged = false;

  commitAndPersist(
    () => {
      // Only reserved (not yet fulfilled) orders release stock on delete.
      // "done" means sold — deleting must not inflate inventory.
      if (current && orderAffectsStock(current) && reserved) {
        stockChanged = restoreStockForItems(current.items) || stockChanged;
      }
      db.run(`DELETE FROM orders WHERE id = ?`, [String(id)]);
    },
    { bump: mayTouchStock, mirrorProducts: mayTouchStock, mirrorOrders: true }
  );
  return { ok: true, products: listProducts(), revision: catalogRevision, stockChanged };
}

function migrateJsonFiles(dataDir) {
  if (!dataDir) return { products: 0, orders: 0 };

  let productsImported = 0;
  let ordersImported = 0;

  if (countRows("products") === 0) {
    const productsPath = path.join(dataDir, "products.json");
    const seedPath = path.join(dataDir, "products.seed.json");
    const raw = readJsonFile(productsPath, null) ?? readJsonFile(seedPath, []);
    const list = Array.isArray(raw) ? raw : [];
    if (list.length) {
      replaceProducts(list);
      productsImported = listProducts().length;
    }
  }

  if (countRows("orders") === 0) {
    const ordersPath = path.join(dataDir, "orders.json");
    const raw = readJsonFile(ordersPath, []);
    const list = Array.isArray(raw) ? raw : [];
    for (const item of list) {
      try {
        if (!item?.id) continue;
        const existing = getOrderById(item.id);
        if (existing) continue;
        // Bypass slot checks for historical import: insert raw
        const kind = item.kind === "booking" || item.channel === "booking" ? "booking" : "order";
        const booking = item.booking || {};
        db.run(
          `INSERT OR IGNORE INTO orders (
            id, created_at, status, kind, channel,
            customer_name, customer_phone, customer_phone_display,
            total, currency,
            booking_procedure, booking_date, booking_time, booking_note,
            items_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(item.id),
            String(item.createdAt || new Date().toISOString()),
            String(item.status || "new"),
            kind,
            String(item.channel || (kind === "booking" ? "booking" : "whatsapp")),
            String(item.customer?.name || ""),
            String(item.customer?.phone || ""),
            String(item.customer?.phoneDisplay || ""),
            Math.round(Number(item.total) || 0),
            String(item.currency || "RUB"),
            kind === "booking" ? String(booking.procedure || "") : null,
            kind === "booking" ? String(booking.date || "") : null,
            kind === "booking" ? String(booking.time || "") : null,
            kind === "booking" ? String(booking.note || "") : null,
            JSON.stringify(Array.isArray(item.items) ? item.items : [])
          ]
        );
        ordersImported += 1;
      } catch {
        // skip bad rows
      }
    }
    if (ordersImported) persist();
  }

  return { products: productsImported, orders: ordersImported };
}

function openDatabaseBuffer(buf, label) {
  assertSqliteHeader(buf, label);
  return new SQL.Database(buf);
}

export async function openStore({ dbFile, dataDir } = {}) {
  if (!dbFile) throw new Error("dbFile is required");
  if (!SQL) SQL = await initSqlJs();
  dbPath = dbFile;
  dataDirPath = dataDir || path.dirname(dbFile);
  dirty = false;
  lastPersistError = null;

  const bakPath = `${dbFile}.bak`;
  let openedFrom = null;

  if (fs.existsSync(dbFile)) {
    try {
      const buf = fs.readFileSync(dbFile);
      db = openDatabaseBuffer(buf, dbFile);
      openedFrom = "primary";
    } catch (primaryError) {
      console.error("CRITICAL: primary SQLite file is corrupt:", primaryError?.message || primaryError);
      if (!fs.existsSync(bakPath)) {
        console.error("CRITICAL: no usable .bak backup; refusing to create empty DB over lost data");
        process.exit(1);
      }
      try {
        const bakBuf = fs.readFileSync(bakPath);
        db = openDatabaseBuffer(bakBuf, bakPath);
        openedFrom = "backup";
        console.error("CRITICAL: recovered SQLite from .bak — primary file was corrupt");
        // Restore primary from good backup without clobbering .bak first.
        try {
          fs.copyFileSync(bakPath, dbFile);
        } catch (copyError) {
          console.error("CRITICAL: failed to restore primary from .bak:", copyError?.message || copyError);
        }
      } catch (bakError) {
        console.error("CRITICAL: SQLite .bak is also corrupt:", bakError?.message || bakError);
        process.exit(1);
      }
    }
  } else if (fs.existsSync(bakPath)) {
    try {
      const bakBuf = fs.readFileSync(bakPath);
      db = openDatabaseBuffer(bakBuf, bakPath);
      openedFrom = "backup";
      console.error("CRITICAL: primary DB missing; recovered from .bak");
      try {
        fs.copyFileSync(bakPath, dbFile);
      } catch (copyError) {
        console.error("CRITICAL: failed to restore primary from .bak:", copyError?.message || copyError);
      }
    } catch (bakError) {
      console.error("CRITICAL: primary missing and .bak corrupt:", bakError?.message || bakError);
      process.exit(1);
    }
  } else {
    db = new SQL.Database();
    openedFrom = "new";
  }

  migrateSchema();
  const migrated = migrateJsonFiles(dataDirPath);
  bumpCatalog();
  // Only force a .bak refresh when we opened a validated DB (never overwrite .bak from corrupt primary).
  try {
    if (openedFrom === "primary" || openedFrom === "new") {
      persist({ forceBackup: true });
    } else {
      persist({ forceBackup: false });
    }
  } catch (error) {
    console.error("CRITICAL: initial DB persist failed:", error?.message || error);
    process.exit(1);
  }
  mirrorProductsJson();
  mirrorOrdersJson();

  return {
    dbFile,
    products: countRows("products"),
    orders: countRows("orders"),
    revision: catalogRevision,
    migrated,
    openedFrom
  };
}

export function getStatus() {
  return {
    ok: !dirty,
    dirty,
    lastPersistError,
    storage: "sqlite",
    dbFile: dbPath,
    products: db ? countRows("products") : 0,
    orders: db ? countRows("orders") : 0,
    revision: catalogRevision,
    scalable: {
      catalogCache: true,
      orderPagination: true,
      writeQueue: true,
      syncMirrors: true
    }
  };
}
