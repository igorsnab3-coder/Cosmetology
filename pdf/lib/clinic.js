import fs from "node:fs";
import path from "node:path";

export function loadClinic(dataDir, projectRoot) {
  const candidates = [
    dataDir ? path.join(dataDir, "clinic.json") : null,
    projectRoot ? path.join(projectRoot, "data", "clinic.json") : null,
    path.join(process.cwd(), "..", "data", "clinic.json")
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8");
      if (!raw.trim()) continue;
      return normalizeClinic(JSON.parse(raw));
    } catch {
      // try next
    }
  }
  return normalizeClinic({});
}

function normalizeClinic(data) {
  const contacts = data?.contacts || {};
  return {
    name: String(data?.specialist || "Яна Сергеевна Землина").trim(),
    role: String(data?.role || "косметолог-эстетист").trim(),
    city: String(data?.city || "").trim(),
    address: String(contacts.address || "").trim(),
    phone: String(contacts.phone || "").trim(),
    email: String(contacts.email || "").trim(),
    telegram: String(contacts.telegramUser || contacts.telegram || "").trim()
  };
}
