import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TOOLS_DIR } from "./paths.js";

let cached = null;

const isToolFile = (name) => name.endsWith(".js") && !name.startsWith("_");

export async function loadTools() {
  if (cached) return cached;
  const names = (await fs.readdir(TOOLS_DIR)).filter(isToolFile).sort();
  const tools = [];
  const seen = new Set();
  for (const name of names) {
    try {
      const filePath = path.join(TOOLS_DIR, name);
      const mod = await import(pathToFileURL(filePath).href);
      const tool = mod.default;
      if (!tool?.name || typeof tool.execute !== "function") {
        console.error(`Invalid tool file skipped: ${name}`);
        continue;
      }
      if (seen.has(tool.name)) {
        console.error(`Duplicate tool name skipped: ${tool.name} (${name})`);
        continue;
      }
      seen.add(tool.name);
      tools.push(tool);
    } catch (error) {
      console.error(`Failed to load tool ${name}:`, error?.message || error);
    }
  }
  if (!tools.length) {
    throw new Error("No AI tools loaded");
  }
  cached = tools;
  return tools;
}
