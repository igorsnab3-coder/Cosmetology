import fs from "node:fs";
import path from "node:path";
import { CLINIC_FILE, ENV_FILE, PRODUCTS_FILE } from "./paths.js";
import { readDotEnv } from "./env.js";

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("Jarvis data read failed:", filePath, String(error?.message || error).slice(0, 160));
    const err = new Error(`data_unavailable:${path.basename(filePath)}`);
    err.cause = error;
    err.code = "data_unavailable";
    throw err;
  }
};

const normalizeProduct = (item) => {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name || "").trim();
  if (!name) return null;
  const price = Number(item.price);
  return {
    id: String(item.id || ""),
    type: String(item.type || "product") === "service" ? "service" : "product",
    name,
    description: String(item.description || "").trim(),
    price: Number.isFinite(price) ? Math.round(price) : 0
  };
};

export function loadConfig() {
  const env = readDotEnv(ENV_FILE);
  const apiKey = String(env.OPENAI_API_KEY || "").trim();
  const model = String(env.OPENAI_MODEL || "").trim() || "gpt-5.4-mini";
  return { apiKey, model };
}

export function createContext() {
  return {
    readClinic() {
      const clinic = readJson(CLINIC_FILE);
      if (!clinic || typeof clinic !== "object") {
        const err = new Error("data_unavailable:clinic.json");
        err.code = "data_unavailable";
        throw err;
      }
      return clinic;
    },
    readProducts(query) {
      const raw = readJson(PRODUCTS_FILE);
      if (!Array.isArray(raw)) {
        const err = new Error("data_unavailable:products.json");
        err.code = "data_unavailable";
        throw err;
      }
      const items = raw.map(normalizeProduct).filter(Boolean);
      const needle = String(query || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .trim();
      if (!needle) return items;
      const tokens = needle
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.replace(/(ами|ями|ах|ях|ов|ев|ы|и|а|я|у|ю|е|о)$/u, ""))
        .filter((token) => token.length >= 3);
      const matched = items.filter((item) => {
        const hay = `${item.name} ${item.description} ${item.type}`.toLowerCase().replace(/ё/g, "е");
        if (hay.includes(needle)) return true;
        return tokens.some((token) => hay.includes(token));
      });
      return matched.length ? matched : items;
    }
  };
}
