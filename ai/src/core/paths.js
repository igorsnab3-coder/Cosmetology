import path from "node:path";
import { fileURLToPath } from "node:url";

const aiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ROOT = path.resolve(process.env.JARVIS_ROOT || path.join(aiDir, ".."));
export const AI_DIR = aiDir;
export const DATA_DIR = path.resolve(
  process.env.JARVIS_DATA_DIR || path.join(ROOT, "data")
);
export const TOOLS_DIR = path.join(aiDir, "src", "tools");

const resolveEnvFile = () => {
  if (process.env.JARVIS_ENV_FILE) {
    return path.resolve(process.env.JARVIS_ENV_FILE);
  }
  // Prefer local non-synced secrets (Windows LocalAppData), not the OneDrive project folder.
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "YanaClinic", ".env");
  }
  return path.join(ROOT, ".env");
};

export const ENV_FILE = resolveEnvFile();
export const PROMPT_FILE = path.join(DATA_DIR, "jarvis-system.txt");
export const CLINIC_FILE = path.join(DATA_DIR, "clinic.json");
export const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
