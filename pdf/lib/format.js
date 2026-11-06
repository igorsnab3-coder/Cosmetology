export function formatMoney(value, currency = "RUB") {
  const amount = Number(value) || 0;
  const code = String(currency || "RUB").toUpperCase();
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: code === "KZT" || code === "USD" ? code : "RUB",
      maximumFractionDigits: code === "USD" ? 2 : 0
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ₽`;
  }
}

export function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

export function escapeFilePart(value) {
  return String(value || "file")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}
