const PRODUCTS_KEY = "yana_products_v1";
const CURRENCY_KEY = "yana_currency_v1";
const ORDERS_KEY = "yana_orders_v1";
const ADMIN_SESSION_KEY = "yana_admin_session";
const ADMIN_TOKEN_KEY = "yana_admin_token";
const CART_KEY = "yana_cart_v1";

export const PHONE_E164 = "79284482425";
export const TELEGRAM_USER = "yana_ivi";

export const ORDER_STATUSES = {
  new: { code: "new", label: "Новый" },
  in_progress: { code: "in_progress", label: "В работе" },
  done: { code: "done", label: "Выполнен" },
  cancelled: { code: "cancelled", label: "Отменён" }
};

export const BOOKING_PROCEDURES = [
  { id: "s-mesotherapy", name: "Мезотерапия", priceHint: "5 000 ₽" },
  { id: "biorevitalization", name: "Биоревитализация", priceHint: "по запросу" },
  { id: "cleaning", name: "Чистка лица", priceHint: "по запросу" },
  { id: "microcurrent", name: "Микротоки", priceHint: "по запросу" },
  { id: "noninvasive", name: "Неинвазивная мезотерапия", priceHint: "по запросу" },
  { id: "care", name: "Уходовая процедура", priceHint: "по запросу" },
  { id: "consult", name: "Консультация", priceHint: "бесплатно" }
];

export const BOOKING_TIME_SLOTS = [
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

/** Базовая валюта хранения цен — рубли. */
export const CURRENCIES = {
  RUB: { code: "RUB", label: "Рубли", symbol: "₽", rateFromRub: 1, locale: "ru-RU", decimals: 0 },
  KZT: { code: "KZT", label: "Тенге", symbol: "₸", rateFromRub: 5.5, locale: "ru-RU", decimals: 0 },
  USD: { code: "USD", label: "Доллары", symbol: "$", rateFromRub: 1 / 92, locale: "en-US", decimals: 2 }
};

export const DEFAULT_PRODUCTS = [
  {
    id: "p1",
    type: "product",
    name: "Сыворотка с гиалуроновой кислотой",
    description: "Интенсивное увлажнение и восстановление гидробаланса кожи.",
    price: 3200,
    stock: 10,
    image: "https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "p2",
    type: "product",
    name: "Крем увлажняющий для лица",
    description: "Лёгкая текстура для ежедневного ухода и мягкого сияния.",
    price: 2800,
    stock: 10,
    image: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "p3",
    type: "product",
    name: "Маска восстанавливающая",
    description: "Успокаивает, питает и возвращает коже комфорт после процедур.",
    price: 1900,
    stock: 10,
    image: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "p4",
    type: "product",
    name: "Тоник для чувствительной кожи",
    description: "Мягкое очищение без стянутости, подготовка к сыворотке и крему.",
    price: 1500,
    stock: 10,
    image: "https://images.unsplash.com/photo-1571875257727-256c39da42af?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "p5",
    type: "product",
    name: "Набор домашнего ухода",
    description: "Базовый набор: очищение, увлажнение и защита кожи дома.",
    price: 4500,
    stock: 10,
    image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "p6",
    type: "product",
    name: "SPF-крем ежедневный",
    description: "Защита от солнца для ежедневного использования, лёгкое покрытие.",
    price: 2100,
    stock: 10,
    image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "s-mesotherapy",
    type: "service",
    name: "Мезотерапия",
    description: "Точечное введение активных компонентов для тонуса, цвета и увлажнённости кожи.",
    price: 5000,
    stock: null,
    image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80"
  }
];

export const ITEM_TYPES = {
  product: { code: "product", label: "Товар" },
  service: { code: "service", label: "Услуга" }
};

export const SHOP_EVENTS = [
  "yana-products-change",
  "yana-cart-change",
  "yana-currency-change",
  "yana-orders-change"
];

let productsCache = null;
let ordersCache = null;
let apiMode = null; // null | true | false
let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
/** Server catalog revision — skip full redraw when unchanged. */
let catalogRevision = 0;

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

export function normalizeItemType(type) {
  return ITEM_TYPES[type] ? type : "product";
}

export function getTypeLabel(type) {
  return ITEM_TYPES[normalizeItemType(type)].label;
}

export function getCurrency() {
  const code = localStorage.getItem(CURRENCY_KEY) || "RUB";
  return CURRENCIES[code] || CURRENCIES.RUB;
}

export function setCurrency(code) {
  if (!CURRENCIES[code]) return getCurrency();
  localStorage.setItem(CURRENCY_KEY, code);
  emit("yana-currency-change", { code });
  return CURRENCIES[code];
}

export function convertFromRub(priceRub, currency = getCurrency()) {
  const value = Number(priceRub) * currency.rateFromRub;
  if (currency.decimals === 0) return Math.round(value);
  return Math.round(value * 100) / 100;
}

export function formatPrice(priceRub, currency = getCurrency()) {
  const value = convertFromRub(priceRub, currency);
  const formatted = value.toLocaleString(currency.locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals
  });
  if (currency.code === "USD") return `${currency.symbol}${formatted}`;
  return `${formatted} ${currency.symbol}`;
}

function safeLocalSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    const message =
      error && (error.name === "QuotaExceededError" || error.code === 22)
        ? "Не хватает места в браузере. Уменьшите фото или удалите старые позиции."
        : "Не удалось сохранить данные в браузере.";
    const err = new Error(message);
    err.cause = error;
    throw err;
  }
}

function readLocalJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeLocalProducts(products) {
  safeLocalSet(PRODUCTS_KEY, JSON.stringify(products));
}

export function createProductId() {
  return `p${Date.now()}`;
}

export function normalizeStock(type, value) {
  if (normalizeItemType(type) === "service") return null;
  if (value === undefined) return 10;
  if (value === null || value === "") return 0;
  const stock = Math.round(Number(value));
  if (!Number.isFinite(stock)) return 0;
  return Math.max(0, Math.min(99999, stock));
}

export function getProductStock(product) {
  if (!product || normalizeItemType(product.type) === "service") return null;
  return normalizeStock("product", product.stock);
}

export function isProductInStock(product) {
  if (!product) return false;
  if (normalizeItemType(product.type) === "service") return true;
  return getProductStock(product) > 0;
}

export function getMaxOrderQty(product) {
  if (!product) return 1;
  if (normalizeItemType(product.type) === "service") return 10;
  return Math.max(0, Math.min(10, getProductStock(product) || 0));
}

function normalizeProduct(product) {
  if (!product || typeof product !== "object") return null;
  const name = String(product.name || "").trim();
  const image = String(product.image || "").trim();
  if (!name || !image) return null;
  const price = Math.round(Number(product.price));
  if (!Number.isFinite(price) || price <= 0) return null;
  const type = normalizeItemType(product.type);
  return {
    id: String(product.id || createProductId()),
    type,
    name,
    description: String(product.description || "").trim(),
    price,
    image,
    stock: normalizeStock(type, product.stock)
  };
}

const API_ERRORS = {
  "Invalid password": "Неверный пароль",
  Unauthorized: "Нужна авторизация",
  "Empty body": "Пустое тело запроса",
  "Missing order": "Нет заказа",
  "Name and phone required": "Укажите имя и телефон",
  "Empty order": "Пустой заказ",
  "Invalid data": "Некорректные данные",
  "Order not found": "Заказ не найден",
  "Missing id": "Не указан id",
  "Slot already booked": "Это время уже занято — выберите другой слот",
  "Insufficient stock": "Не хватает товара на складе — обновите корзину",
  "Unknown product": "Товар не найден в каталоге",
  "Unknown procedure": "Неизвестная процедура",
  "Invalid quantity": "Некорректное количество",
  "Too many items": "Слишком много позиций в заказе",
  "Too many requests": "Слишком много запросов — подождите минуту",
  "Payload too large": "Слишком большой запрос",
  "Catalog cannot be empty": "Каталог не может быть пустым",
  "Order id conflict": "Конфликт id заказа — обновите страницу",
  "Invalid date or time": "Некорректная дата или время",
  "Procedure, date and time required": "Укажите процедуру, дату и время",
  "Server error": "Ошибка сервера",
  "Not found": "Не найдено",
  "Failed to generate PDF": "Не удалось сформировать PDF",
  "PDF service is not ready": "Сервис PDF не запущен",
  "PDF service failed": "Ошибка сервиса PDF"
};

async function apiFetch(path, options = {}) {
  const { timeoutMs = 15000, signal: outerSignal, ...fetchOptions } = options;
  const headers = { Accept: "application/json", ...(fetchOptions.headers || {}) };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => controller.abort(outerSignal?.reason || new Error("aborted"));
  if (outerSignal) {
    if (outerSignal.aborted) onOuterAbort();
    else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("timeout"));
  }, timeoutMs);

  let response;
  try {
    response = await fetch(path, { ...fetchOptions, headers, signal: controller.signal });
  } catch (error) {
    if (outerSignal?.aborted && !timedOut) {
      const err = new Error("Запрос отменён");
      err.status = 0;
      err.code = "aborted";
      err.cause = error;
      throw err;
    }
    const isTimeout =
      timedOut ||
      error?.name === "TimeoutError" ||
      (error?.name === "AbortError" && timedOut);
    const err = new Error(isTimeout ? "Сервер не отвечает, попробуйте ещё раз" : "Нет соединения с сервером");
    err.status = 0;
    err.code = isTimeout ? "timeout" : "network";
    err.cause = error;
    throw err;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener?.("abort", onOuterAbort);
  }

  // 304 is "ok" in fetch (2xx) but has an empty body — never treat as empty catalog.
  if (response.status === 304) {
    return { __notModified: true, revision: catalogRevision };
  }
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("[shop] Invalid JSON from", path, response.status, text.slice(0, 200));
      if (response.ok) {
        const err = new Error("Некорректный ответ сервера");
        err.status = response.status;
        err.code = "invalid_json";
        err.invalidBody = true;
        throw err;
      }
      data = null;
    }
  }
  if (!response.ok) {
    const raw = (data && data.error) || "";
    const err = new Error(API_ERRORS[raw] || raw || `Ошибка сервера (${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  if (data === null || typeof data !== "object") {
    const err = new Error("Некорректный ответ сервера");
    err.status = response.status;
    err.code = "invalid_json";
    err.invalidBody = true;
    throw err;
  }
  return data;
}

const jsonBody = (method, payload) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

let apiModeCheckedAt = 0;
const API_MODE_RETRY_MS = 8000;

export async function detectApi() {
  if (location.protocol === "file:") {
    apiMode = false;
    return false;
  }
  // Once confirmed online, keep trusting until an actual request fails.
  if (apiMode === true) return true;
  // Failed probe: retry after a short TTL so a slow boot does not trap the session offline.
  const now = Date.now();
  if (apiMode === false && now - apiModeCheckedAt < API_MODE_RETRY_MS) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
    let healthOk = response.ok;
    if (healthOk) {
      try {
        const health = await response.clone().json();
        if (health && health.ok === false) healthOk = false;
      } catch (error) {
        // keep status-based result
      }
    }
    apiMode = healthOk;
  } catch (error) {
    apiMode = false;
  } finally {
    clearTimeout(timer);
  }
  apiModeCheckedAt = Date.now();
  return apiMode;
}

export function isServerMode() {
  return apiMode === true;
}

export function getProducts() {
  if (Array.isArray(productsCache)) return productsCache.map((item) => ({ ...item }));

  const local = readLocalJsonArray(PRODUCTS_KEY);
  if (local) {
    const imageFixes = {
      "https://images.unsplash.com/photo-1571781926291-c77df8097c1f?auto=format&fit=crop&w=800&q=80":
        "https://images.unsplash.com/photo-1571875257727-256c39da42af?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1570194065650-d99fb4b38b17?auto=format&fit=crop&w=800&q=80":
        "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=80"
    };
    let changed = false;
    productsCache = local
      .map((product) => {
        const next = { ...product };
        const fixed = imageFixes[next.image];
        if (fixed) {
          changed = true;
          next.image = fixed;
        }
        if (!ITEM_TYPES[next.type]) {
          changed = true;
          next.type = "product";
        }
        return normalizeProduct(next);
      })
      .filter(Boolean);
    if (changed) {
      try {
        writeLocalProducts(productsCache);
      } catch (error) {
        // keep memory cache
      }
    }
    return productsCache.map((item) => ({ ...item }));
  }

  productsCache = DEFAULT_PRODUCTS.map((item) => ({ ...item }));
  try {
    writeLocalProducts(productsCache);
  } catch (error) {
    // ignore first-write quota
  }
  return productsCache.map((item) => ({ ...item }));
}

function pruneCart(productList) {
  const byId = new Map((productList || []).map((item) => [item.id, item]));
  const cart = getCart();
  const next = [];
  let changed = false;
  cart.forEach((item) => {
    const product = byId.get(item.id);
    if (!product) {
      changed = true;
      return;
    }
    if (!isProductInStock(product)) {
      changed = true;
      return;
    }
    const maxQty = getMaxOrderQty(product);
    const quantity = Math.max(1, Math.min(maxQty, Number(item.quantity) || 1));
    if (quantity !== Number(item.quantity)) changed = true;
    next.push({ id: item.id, quantity });
  });
  if (changed || next.length !== cart.length) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      emit("yana-cart-change");
    } catch (error) {
      // keep going
    }
  }
}

function setProductsCache(products) {
  productsCache = (products || []).map(normalizeProduct).filter(Boolean);
  pruneCart(productsCache);
  emit("yana-products-change");
}

function looksCorruptedCatalog(products) {
  if (!Array.isArray(products) || !products.length) return false;
  const broken = products.filter((item) => {
    const value = String(item?.name || "").trim();
    return !value || /\?{3,}/.test(value);
  }).length;
  return broken >= Math.ceil(products.length / 2);
}

export async function refreshProducts() {
  if (await detectApi()) {
    const headers = {};
    if (catalogRevision > 0) headers["If-None-Match"] = `W/"cat-${catalogRevision}"`;
    const data = await apiFetch("/api/products", { cache: "no-store", headers });
    if (data?.__notModified && Array.isArray(productsCache)) {
      return getProducts();
    }
    const nextRevision = Number(data?.revision) || 0;
    if (nextRevision > 0 && nextRevision === catalogRevision && Array.isArray(productsCache)) {
      return getProducts();
    }
    if (!Array.isArray(data?.products)) {
      console.warn("[shop] empty/invalid catalog: products is not an array");
      throw new Error("Каталог получен в неверном формате");
    }
    let list = data.products;
    if (!list.length) {
      console.warn("[shop] empty/invalid catalog: server returned empty products");
      // Keep previous cache / cart — do not prune or overwrite local mirror with [].
      if (Array.isArray(productsCache) && productsCache.length) return getProducts();
      throw new Error("Каталог пуст на сервере");
    }
    if (looksCorruptedCatalog(list)) {
      console.warn("[shop] empty/invalid catalog: corrupted names, keeping previous cache");
      if (Array.isArray(productsCache) && productsCache.length) return getProducts();
      // Never auto-PUT defaults to the server — show defaults in this browser only.
      list = DEFAULT_PRODUCTS.map((item) => ({ ...item }));
      productsCache = list.map(normalizeProduct).filter(Boolean);
      emit("yana-products-change");
      return getProducts();
    }
    if (nextRevision > 0) catalogRevision = nextRevision;
    setProductsCache(list);
    try {
      writeLocalProducts(productsCache);
    } catch (error) {
      // mirror is optional
    }
    return getProducts();
  }

  const local = getProducts();
  if (looksCorruptedCatalog(local)) {
    return saveProducts(DEFAULT_PRODUCTS.map((item) => ({ ...item })), { allowLocal: true, overwriteStock: true });
  }
  return local;
}

export async function saveProducts(products, options = {}) {
  const next = (products || []).map(normalizeProduct).filter(Boolean);
  if (!next.length && options.allowEmpty !== true) {
    throw new Error("Каталог не может быть пустым");
  }
  if (await detectApi()) {
    if (!adminToken) throw new Error("Войдите в админку, чтобы сохранить каталог");
    const payload = {
      products: next,
      // Default: server keeps live stock for existing ids (avoids stale-tab rollback).
      preserveStock: options.preserveStock !== false && options.overwriteStock !== true,
      overwriteStock: options.overwriteStock === true,
      allowEmpty: options.allowEmpty === true,
      stockOverrides: Array.isArray(options.stockOverrides) ? options.stockOverrides : []
    };
    const data = await apiFetch("/api/products", jsonBody("PUT", payload));
    if (Number(data.revision) > 0) catalogRevision = Number(data.revision);
    setProductsCache(Array.isArray(data.products) ? data.products : next);
  } else if (options.allowLocal === true) {
    writeLocalProducts(next);
    setProductsCache(next);
  } else {
    throw new Error("Сервер недоступен — каталог не сохранён");
  }
  return getProducts();
}

export async function upsertProduct(product, options = {}) {
  const normalized = normalizeProduct(product);
  if (!normalized) throw new Error("Заполните название, цену и фото");
  // Merge onto a fresh catalog so we do not resurrect deleted rows from a stale tab.
  if (await detectApi()) {
    try {
      await refreshProducts();
    } catch (error) {
      // keep current cache if refresh fails; save will still hit the server
    }
  }
  const products = getProducts();
  const index = products.findIndex((item) => item.id === normalized.id);
  const isNew = index < 0;
  if (index >= 0) {
    // Keep live stock unless the admin explicitly changed it in the form.
    if (options.touchStock !== true && normalized.type === "product") {
      normalized.stock = products[index].stock;
    }
    products[index] = normalized;
  } else {
    products.unshift(normalized);
  }
  return saveProducts(products, {
    stockOverrides: options.touchStock === true || isNew ? [normalized.id] : []
  });
}

export async function deleteProduct(id) {
  return saveProducts(
    getProducts().filter((item) => item.id !== id),
    { stockOverrides: [] }
  );
}

/* Cart */

export function getCart() {
  return readLocalJsonArray(CART_KEY) || [];
}

function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (error) {
    throw new Error("Не удалось сохранить корзину в браузере");
  }
  emit("yana-cart-change");
}

export function getCartLines() {
  const byId = new Map(getProducts().map((entry) => [entry.id, entry]));
  return getCart()
    .map((item) => {
      const product = byId.get(item.id);
      if (!product || !isProductInStock(product)) return null;
      const maxQty = getMaxOrderQty(product);
      const quantity = Math.max(1, Math.min(maxQty, Number(item.quantity) || 1));
      return { ...product, quantity, lineTotal: Number(product.price) * quantity };
    })
    .filter(Boolean);
}

export function getCartCount() {
  return getCartLines().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export function getCartTotal() {
  return getCartLines().reduce((sum, item) => sum + item.lineTotal, 0);
}

export function addToCart(productId, quantity = 1) {
  const product = getProducts().find((entry) => entry.id === productId);
  if (!product) return;
  if (!isProductInStock(product)) {
    throw new Error("Товара нет в наличии");
  }
  const maxQty = getMaxOrderQty(product);
  if (maxQty <= 0) throw new Error("Товара нет в наличии");
  const qty = Math.max(1, Math.min(maxQty, Number(quantity) || 1));
  const cart = getCart();
  const index = cart.findIndex((item) => item.id === productId);
  if (index >= 0) {
    cart[index].quantity = Math.min(maxQty, Number(cart[index].quantity || 0) + qty);
  } else {
    cart.push({ id: productId, quantity: qty });
  }
  saveCart(cart);
}

export function setCartQuantity(productId, quantity) {
  const product = getProducts().find((entry) => entry.id === productId);
  if (!product && quantity > 0) return;
  if (product && !isProductInStock(product) && quantity > 0) {
    saveCart(getCart().filter((item) => item.id !== productId));
    return;
  }
  const maxQty = product ? getMaxOrderQty(product) : 0;
  const qty = Math.max(0, Math.min(maxQty || 0, Number(quantity) || 0));
  let cart = getCart();
  if (qty <= 0) {
    cart = cart.filter((item) => item.id !== productId);
  } else {
    const index = cart.findIndex((item) => item.id === productId);
    if (index >= 0) cart[index].quantity = qty;
    else cart.push({ id: productId, quantity: qty });
  }
  saveCart(cart);
}

export function changeCartQuantity(productId, delta) {
  const current = getCart().find((item) => item.id === productId);
  setCartQuantity(productId, Number(current?.quantity || 0) + delta);
}

export function removeFromCart(productId) {
  saveCart(getCart().filter((item) => item.id !== productId));
}

export function clearCart() {
  saveCart([]);
}

/* Customers */

export function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  if (national.length === 10) return `7${national}`;
  return national;
}

export function formatPhoneDisplay(phone) {
  const digits = normalizePhone(phone);
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return String(phone || "").trim();
}

/** Маска ввода телефона: +7 (XXX) XXX-XX-XX */
export function maskPhoneInput(value) {
  let digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  else if (!digits.startsWith("7")) digits = `7${digits}`.slice(0, 11);

  const rest = digits.slice(1);
  let next = "+7";
  if (rest.length > 0) next += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) next += ")";
  if (rest.length > 3) next += ` ${rest.slice(3, 6)}`;
  if (rest.length >= 6) next += `-${rest.slice(6, 8)}`;
  if (rest.length >= 8) next += `-${rest.slice(8, 10)}`;
  return next;
}

export function isValidCustomer(customer) {
  const name = String(customer?.name || "").trim();
  const phone = normalizePhone(customer?.phone);
  return name.length >= 2 && phone.length === 11 && phone.startsWith("7");
}

/* Orders */

function createSecureId(prefix) {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function createOrderId() {
  return createSecureId("ord");
}

function createBookingId() {
  return createSecureId("book");
}

function writeLocalOrders(orders) {
  safeLocalSet(ORDERS_KEY, JSON.stringify(orders));
}

function normalizeOrderCustomer(customer) {
  const phone = normalizePhone(customer?.phone || customer?.phoneDisplay);
  return {
    name: String(customer?.name || "").trim(),
    phone,
    phoneDisplay: formatPhoneDisplay(phone || customer?.phoneDisplay)
  };
}

function normalizeOrderRecord(order) {
  if (!order || typeof order !== "object") return null;
  const status = ORDER_STATUSES[order.status] ? order.status : "new";
  const kind = order.kind === "booking" || order.channel === "booking" ? "booking" : "order";
  const channel =
    kind === "booking" ? "booking" : order.channel === "telegram" ? "telegram" : "whatsapp";
  const items = Array.isArray(order.items)
    ? order.items.map((item) => {
        const price = Math.max(0, Number(item?.price) || 0);
        const quantity = Math.max(1, Math.min(99, Number(item?.quantity) || 1));
        return {
          id: String(item?.id || ""),
          type: normalizeItemType(item?.type),
          name: String(item?.name || "").trim(),
          price,
          quantity,
          lineTotal: Number(item?.lineTotal) || price * quantity
        };
      })
    : [];
  const total = Number(order.total);
  const bookingRaw = order.booking && typeof order.booking === "object" ? order.booking : {};
  const booking =
    kind === "booking"
      ? {
          procedure: String(bookingRaw.procedure || items[0]?.name || "").trim(),
          date: String(bookingRaw.date || "").trim(),
          time: String(bookingRaw.time || "").trim(),
          note: String(bookingRaw.note || "").trim()
        }
      : null;
  return {
    id: String(order.id || createOrderId()),
    createdAt: String(order.createdAt || new Date().toISOString()),
    status,
    kind,
    channel,
    customer: normalizeOrderCustomer(order.customer || {}),
    items,
    total: Number.isFinite(total) ? total : items.reduce((sum, item) => sum + item.lineTotal, 0),
    currency: String(order.currency || "RUB"),
    booking
  };
}

export function getOrders() {
  if (!Array.isArray(ordersCache)) {
    ordersCache = (readLocalJsonArray(ORDERS_KEY) || []).map(normalizeOrderRecord).filter(Boolean);
  }
  return ordersCache.map((item) => ({
    ...item,
    customer: { ...item.customer },
    items: (item.items || []).map((line) => ({ ...line })),
    booking: item.booking ? { ...item.booking } : null
  }));
}

function setOrdersCache(orders) {
  ordersCache = (Array.isArray(orders) ? orders : []).map(normalizeOrderRecord).filter(Boolean);
  emit("yana-orders-change");
}

export async function refreshOrders() {
  if (await detectApi()) {
    if (!adminToken) {
      setOrdersCache([]);
      return [];
    }
    try {
      // Light scale: page of recent orders (enough for clinic admin UI).
      const data = await apiFetch("/api/orders?limit=500&offset=0", { cache: "no-store" });
      setOrdersCache(Array.isArray(data.orders) ? data.orders : []);
      try {
        writeLocalOrders(ordersCache);
      } catch (error) {
        // optional mirror
      }
      return getOrders();
    } catch (error) {
      if (error.status === 401) {
        clearAdminSession();
        setOrdersCache([]);
        return [];
      }
      throw error;
    }
  }
  return getOrders();
}

export function getOrderStatusLabel(status) {
  return ORDER_STATUSES[status]?.label || ORDER_STATUSES.new.label;
}

function createOrderFromLines(lines, customer, channel) {
  const items = (lines || []).map((item) => ({
    id: item.id,
    type: normalizeItemType(item.type),
    name: item.name,
    price: Number(item.price) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
    lineTotal: Number(item.lineTotal) || Number(item.price) * Math.max(1, Number(item.quantity) || 1)
  }));
  return {
    id: createOrderId(),
    createdAt: new Date().toISOString(),
    status: "new",
    channel: channel === "telegram" ? "telegram" : "whatsapp",
    customer: normalizeOrderCustomer(customer),
    items,
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
    // Storage currency is always RUB; display conversion is client-only.
    currency: "RUB"
  };
}

async function saveOrder(order) {
  if (await detectApi()) {
    let lastError = null;
    let data = null;
    // Same order.id on retry → server dedups (idempotent POST).
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        data = await apiFetch("/api/orders", jsonBody("POST", { order }));
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const status = Number(error?.status) || 0;
        if (status === 409) {
          try {
            await refreshProducts();
            pruneCart(getProducts());
          } catch (refreshError) {
            // ignore
          }
        }
        const retryable =
          !status || status === 429 || status >= 500 || error?.invalidBody || error?.code === "timeout";
        if (!retryable || attempt >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    if (lastError) throw lastError;
    if (!data || typeof data !== "object" || !data.order) {
      throw Object.assign(new Error("Некорректный ответ сервера"), { invalidBody: true });
    }
    const saved = normalizeOrderRecord(data.order || order);
    // Trust server notify flag only — do not mask failed Telegram on idempotent replay.
    saved.telegramNotify = data.telegramNotify === true;
    saved.idempotent = Boolean(data.idempotent);
    if (saved.telegramNotify === false) {
      console.warn("[shop] Telegram notify not confirmed for", saved.id);
      saved.notifyFallbackUrl = `https://t.me/${TELEGRAM_USER}?text=${encodeURIComponent(
        `Дубль для @${TELEGRAM_USER}\n\nID: ${saved.id}`
      )}`;
    }
    if (Number(data.revision) > 0) catalogRevision = Number(data.revision);
    if (Array.isArray(data.products)) {
      setProductsCache(data.products);
      try {
        writeLocalProducts(productsCache);
      } catch (error) {
        // optional mirror
      }
    } else {
      try {
        await refreshProducts();
      } catch (error) {
        // keep previous catalog if refresh fails
      }
    }
    if (Array.isArray(ordersCache)) {
      setOrdersCache([saved, ...ordersCache.filter((item) => item.id !== saved.id)]);
    } else if (isAdminLoggedIn()) {
      setOrdersCache([saved]);
    }
    return saved;
  }

  throw new Error("Сервер недоступен — заказ не сохранён. Обновите страницу и попробуйте снова.");
}

/* Booking */

export function formatBookingDateLabel(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return String(isoDate);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return String(isoDate);
  return date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
}

function createBookingOrder({ procedureId, procedureName, date, time, note, customer }) {
  let price = 0;
  let itemId = procedureId || "booking";
  if (procedureId) {
    const catalogItem = getProducts().find((item) => item.id === procedureId);
    if (catalogItem) {
      price = Math.max(0, Number(catalogItem.price) || 0);
      itemId = catalogItem.id;
    }
  }

  return {
    id: createBookingId(),
    createdAt: new Date().toISOString(),
    status: "new",
    kind: "booking",
    channel: "booking",
    customer: normalizeOrderCustomer(customer || {}),
    items: [{ id: itemId, type: "service", name: procedureName, price, quantity: 1, lineTotal: price }],
    total: price,
    currency: "RUB",
    booking: { procedure: procedureName, date, time, note }
  };
}

function buildBookingMessage(order) {
  const booking = order?.booking || {};
  return [
    "Запись на процедуру через сайт",
    "",
    `Имя: ${order?.customer?.name || ""}`,
    `Телефон: ${order?.customer?.phoneDisplay || formatPhoneDisplay(order?.customer?.phone)}`,
    `Процедура: ${booking.procedure || order?.items?.[0]?.name || ""}`,
    `Дата: ${formatBookingDateLabel(booking.date) || booking.date || ""}`,
    `Время: ${booking.time || ""}`,
    booking.note ? `Комментарий: ${booking.note}` : "",
    order?.id ? `ID: ${order.id}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

let placeBookingInFlight = null;

export async function placeBooking(payload) {
  if (placeBookingInFlight) return placeBookingInFlight;
  placeBookingInFlight = (async () => {
    const procedureId = String(payload?.procedureId || "").trim();
    const procedureMeta = BOOKING_PROCEDURES.find((item) => item.id === procedureId);
    const procedureName = String(payload?.procedureName || procedureMeta?.name || "").trim();
    const date = String(payload?.date || "").trim();
    const time = String(payload?.time || "").trim();
    const customer = payload?.customer || {};

    if (!procedureName) throw new Error("Выберите процедуру");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Выберите удобный день");
    if (!BOOKING_TIME_SLOTS.includes(time)) throw new Error("Выберите удобное время");
    if (!isValidCustomer(customer)) throw new Error("Укажите имя и корректный телефон");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = date.split("-").map(Number);
    const selected = new Date(y, m - 1, d);
    if (Number.isNaN(selected.getTime()) || selected < today) {
      throw new Error("Дата не может быть в прошлом");
    }

    // Stable client id for the whole attempt — server dedups on this id.
    const draft = createBookingOrder({
      procedureId,
      procedureName,
      date,
      time,
      note: String(payload?.note || "").trim().slice(0, 200),
      customer
    });
    const order = await saveOrder(draft);

    if (order && order.telegramNotify === false) {
      const fallbackUrl =
        order.notifyFallbackUrl ||
        `https://t.me/${TELEGRAM_USER}?text=${encodeURIComponent(
          `Дубль записи для @${TELEGRAM_USER}\n\n${buildBookingMessage(order)}`
        )}`;
      order.notifyFallbackUrl = fallbackUrl;
      try {
        const opened = window.open(fallbackUrl, "_blank", "noopener,noreferrer");
        order.notifyFallbackOpened = Boolean(opened);
      } catch (error) {
        console.warn("[shop] Telegram fallback open failed", error);
        order.notifyFallbackOpened = false;
      }
    }

    return order;
  })();
  try {
    return await placeBookingInFlight;
  } finally {
    placeBookingInFlight = null;
  }
}

function applyProductsFromOrderMutation(data) {
  if (Number(data?.revision) > 0) catalogRevision = Number(data.revision);
  if (!Array.isArray(data?.products)) return;
  setProductsCache(data.products);
  try {
    writeLocalProducts(productsCache);
  } catch (error) {
    // optional mirror
  }
}

export async function updateOrderStatus(orderId, status) {
  if (!ORDER_STATUSES[status]) return null;
  if (await detectApi()) {
    if (!adminToken) throw new Error("Войдите в админку");
    const data = await apiFetch("/api/orders", jsonBody("PATCH", { id: orderId, status }));
    setOrdersCache(
      getOrders().map((item) => (item.id === orderId ? data.order || { ...item, status } : item))
    );
    applyProductsFromOrderMutation(data);
    return data.order || null;
  }

  const orders = getOrders();
  const index = orders.findIndex((item) => item.id === orderId);
  if (index < 0) return null;
  orders[index] = { ...orders[index], status };
  writeLocalOrders(orders);
  setOrdersCache(orders);
  return orders[index];
}

export async function deleteOrder(orderId) {
  if (await detectApi()) {
    if (!adminToken) throw new Error("Войдите в админку");
    const data = await apiFetch(`/api/orders?id=${encodeURIComponent(orderId)}`, { method: "DELETE" });
    setOrdersCache(getOrders().filter((item) => item.id !== orderId));
    applyProductsFromOrderMutation(data);
    return;
  }

  const orders = getOrders().filter((item) => item.id !== orderId);
  writeLocalOrders(orders);
  setOrdersCache(orders);
}

/* Messengers */

function buildCustomerBlock(customer) {
  const name = String(customer?.name || "").trim();
  return [`Имя: ${name}`, `Телефон: ${formatPhoneDisplay(customer?.phone)}`].join("\n");
}

function buildCartOrderMessage(customer) {
  const lines = getCartLines();
  if (!lines.length) return "";

  const itemsText = lines
    .map(
      (item, index) =>
        `${index + 1}. ${getTypeLabel(item.type)}: ${item.name}\n` +
        `   Кол-во: ${item.quantity} × ${formatPrice(item.price)} = ${formatPrice(item.lineTotal)}`
    )
    .join("\n");

  return [
    "Здравствуйте! Хочу оформить заказ из корзины:",
    "",
    buildCustomerBlock(customer),
    "",
    itemsText,
    "",
    `Итого: ${formatPrice(getCartTotal())}`,
    "",
    "Подскажите, пожалуйста, как можно получить заказ."
  ].join("\n");
}

function openTelegramWithMessage(message) {
  const popup = window.open("about:blank", "_blank");
  const writeClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch (error) {
      // clipboard may be blocked
    }
  };

  if (popup) {
    popup.opener = null;
    popup.location.href = `https://t.me/${TELEGRAM_USER}`;
    writeClipboard();
    return;
  }

  writeClipboard().finally(() => {
    window.location.href = `https://t.me/${TELEGRAM_USER}`;
  });
}

let placeCartOrderInFlight = null;

export async function placeCartOrder(customer, channel) {
  if (placeCartOrderInFlight) return placeCartOrderInFlight;
  placeCartOrderInFlight = (async () => {
    if (!isValidCustomer(customer)) throw new Error("Укажите имя и корректный номер телефона");
    const lines = getCartLines();
    if (!lines.length) throw new Error("Корзина пуста");

    const message = buildCartOrderMessage(customer);
    const draft = createOrderFromLines(lines, customer, channel);
    const order = await saveOrder(draft);
    if (channel === "telegram") {
      openTelegramWithMessage(message);
    } else {
      window.open(
        `https://wa.me/${PHONE_E164}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      );
      // Fallback only when server explicitly confirmed telegramNotify:false
      if (order && order.telegramNotify === false) {
        const fallbackText = `Дубль заказа для @${TELEGRAM_USER}\n\n${message}`;
        order.notifyFallbackUrl =
          order.notifyFallbackUrl ||
          `https://t.me/${TELEGRAM_USER}?text=${encodeURIComponent(fallbackText)}`;
        try {
          openTelegramWithMessage(fallbackText);
          order.notifyFallbackOpened = true;
        } catch (error) {
          console.warn("[shop] Telegram fallback failed", error);
          order.notifyFallbackOpened = false;
        }
      }
    }
    try {
      clearCart();
    } catch (error) {
      // Order already saved — do not fail the whole checkout on localStorage issues.
    }
    return order;
  })();
  try {
    return await placeCartOrderInFlight;
  } finally {
    placeCartOrderInFlight = null;
  }
}

/* Admin CRM */

function buildAdminWhatsAppFollowUpMessage(order) {
  const name = String(order?.customer?.name || "").trim();
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  if (order?.kind === "booking" || order?.channel === "booking") {
    const booking = order.booking || {};
    const procedure = booking.procedure || order?.items?.[0]?.name || "процедуру";
    const when = [formatBookingDateLabel(booking.date) || booking.date, booking.time]
      .filter(Boolean)
      .join(", ");
    return `${greeting} Подтверждаем вашу запись на ${procedure}${when ? ` (${when})` : ""}. Ждём вас!`;
  }
  const items = (order?.items || []).map((item) => `${item.name} × ${item.quantity}`).join(", ");
  const details = items
    ? `\n\nВы оставляли заявку: ${items}.\nИтого: ${formatPrice(order.total || 0)}.`
    : "";
  return `${greeting} Вы хотели заказать у нас что-то?${details}`;
}

export function getAdminWhatsAppFollowUpUrl(order) {
  const phone = normalizePhone(order?.customer?.phone);
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildAdminWhatsAppFollowUpMessage(order))}`;
}

export function getClients() {
  const byPhone = new Map();

  getOrders().forEach((order) => {
    const phone = normalizePhone(order?.customer?.phone || order?.customer?.phoneDisplay);
    if (!phone || phone.length !== 11 || !phone.startsWith("7")) return;

    const name = String(order?.customer?.name || "").trim();
    const total = order.status === "cancelled" ? 0 : Number(order.total) || 0;
    const createdAt = order.createdAt || "";
    const isOpen = order.status === "new" || order.status === "in_progress";
    const existing = byPhone.get(phone);

    if (!existing) {
      byPhone.set(phone, {
        id: phone,
        phone,
        phoneDisplay: formatPhoneDisplay(phone),
        name: name || "Без имени",
        ordersCount: 1,
        totalSpent: total,
        lastOrderAt: createdAt,
        lastOrderId: order.id,
        openOrders: isOpen ? 1 : 0
      });
      return;
    }

    existing.ordersCount += 1;
    existing.totalSpent += total;
    if (isOpen) existing.openOrders += 1;

    const isNewer = !existing.lastOrderAt || String(createdAt) > String(existing.lastOrderAt);
    if (isNewer) {
      existing.lastOrderAt = createdAt;
      existing.lastOrderId = order.id;
      if (name) existing.name = name;
    } else if (name && existing.name === "Без имени") {
      existing.name = name;
    }
  });

  return Array.from(byPhone.values()).sort((a, b) =>
    String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || ""))
  );
}

export function getAdminWhatsAppClientUrl(client) {
  const phone = normalizePhone(client?.phone);
  if (!phone) return "";
  const name = String(client?.name || "").trim();
  const greeting = name && name !== "Без имени" ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`${greeting} Вы хотели заказать у нас что-то?`)}`;
}

/* Admin session */

function clearAdminSession() {
  adminToken = "";
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export function isAdminLoggedIn() {
  // Admin always requires a live server session token — no local demo bypass.
  return Boolean(adminToken);
}

export async function loginAdmin(password) {
  const value = String(password || "").trim();
  if (!value) return false;

  if (!(await detectApi())) {
    clearAdminSession();
    throw new Error("Сервер недоступен — вход в админку невозможен");
  }

  let data;
  try {
    data = await apiFetch("/api/admin/login", jsonBody("POST", { password: value }));
  } catch (error) {
    clearAdminSession();
    if (error?.status === 401 || error?.status === 403) return false;
    console.error("[shop] Admin login failed:", error);
    throw error;
  }
  adminToken = data?.token || "";
  if (!adminToken) {
    clearAdminSession();
    throw new Error("Сервер не вернул токен");
  }
  sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  try {
    await refreshOrders();
  } catch (error) {
    console.warn("[shop] Orders refresh after login failed:", error);
  }
  return true;
}

export async function logoutAdmin() {
  if (await detectApi()) {
    try {
      await apiFetch("/api/admin/logout", { method: "POST" });
    } catch (error) {
      // ignore network errors on logout
    }
  }
  clearAdminSession();
  setOrdersCache([]);
}

export async function restoreAdminSession() {
  if (!(await detectApi())) return isAdminLoggedIn();
  if (!adminToken) {
    clearAdminSession();
    return false;
  }
  try {
    const data = await apiFetch("/api/admin/session", { cache: "no-store" });
    if (!data.ok) {
      clearAdminSession();
      return false;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    await refreshOrders();
    return true;
  } catch (error) {
    clearAdminSession();
    return false;
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "document.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadPdf(path, filename) {
  if (!(await detectApi())) {
    throw new Error("Сервер не запущен — PDF доступен только через serve.ps1");
  }
  if (!adminToken) {
    throw new Error("Войдите в админку, чтобы скачать PDF");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(path, {
      headers: {
        Accept: "application/pdf",
        Authorization: `Bearer ${adminToken}`
      },
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError" || error?.name === "TimeoutError";
    throw new Error(timedOut ? "Сервер не отвечает, попробуйте ещё раз" : "Нет соединения с сервером");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
      const data = await response.json();
      const raw = (data && data.error) || "";
      message = API_ERRORS[raw] || raw || message;
    } catch (error) {
      // keep status message
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const blob = await response.blob();
  if (!contentType.includes("application/pdf") && !(blob.type || "").includes("pdf")) {
    throw new Error("Сервер вернул не PDF");
  }
  if (!blob.size) {
    throw new Error("Пустой PDF");
  }
  triggerBlobDownload(blob, filename);
}

export async function downloadOrderPdf(orderId) {
  const id = encodeURIComponent(String(orderId || "").trim());
  if (!id) throw new Error("Не указан id");
  await downloadPdf(`/api/pdf/orders/${id}`, `order_${String(orderId).replace(/[^\w.-]+/g, "_")}.pdf`);
}

export async function downloadCatalogPdf(type = "all") {
  const filter = type === "product" || type === "service" ? type : "all";
  await downloadPdf(
    `/api/pdf/catalog?type=${encodeURIComponent(filter)}`,
    `catalog_${filter}.pdf`
  );
}

export const ready = (async () => {
  await detectApi();
  let catalogError = null;
  try {
    await refreshProducts();
  } catch (error) {
    catalogError = error;
    console.error("[shop] Initial catalog refresh failed:", error);
  }
  if (isAdminLoggedIn()) {
    try {
      await restoreAdminSession();
    } catch (error) {
      console.warn("[shop] restoreAdminSession during ready failed:", error);
    }
  }
  return { api: apiMode === true, catalogStale: Boolean(catalogError), catalogError };
})();
