import { formatMoney } from "../lib/format.js";
import { escapeHtml, safeImageSrc } from "../lib/html.js";

const MAX_ITEMS = 60;

export function renderCatalogHtml(products, clinic, filterType = "all") {
  const typeFilter = filterType === "product" || filterType === "service" ? filterType : "all";
  const list = (Array.isArray(products) ? products : [])
    .filter((item) => (typeFilter === "all" ? true : String(item.type || "product") === typeFilter))
    .slice(0, MAX_ITEMS);

  const filterLabel =
    typeFilter === "product" ? "Товары" : typeFilter === "service" ? "Услуги" : "Товары и услуги";

  const cardsHtml = list
    .map((item) => {
      const src = safeImageSrc(item.image);
      const isService = String(item.type || "") === "service";
      const stockLabel = isService
        ? "Услуга"
        : Number.isFinite(Number(item.stock))
          ? `Остаток: ${item.stock}`
          : "Остаток: —";
      const imgBlock = src
        ? `<img src="${escapeHtml(src)}" class="card-img" alt="" />`
        : `<div class="card-no-img">Нет фото</div>`;

      return `
      <div class="card">
        <div class="card-img-wrap">${imgBlock}</div>
        <div class="card-content">
          <div>
            <div class="card-title">${escapeHtml(item.name || "—")}</div>
            <div class="card-desc">${escapeHtml(item.description || "Описание отсутствует")}</div>
          </div>
          <div class="card-footer">
            <span class="card-price">${escapeHtml(formatMoney(item.price, "RUB"))}</span>
            <span class="card-stock">${escapeHtml(stockLabel)}</span>
          </div>
        </div>
      </div>`;
    })
    .join("");

  const truncatedNote =
    Array.isArray(products) && products.length > MAX_ITEMS
      ? `Показаны первые ${MAX_ITEMS} из ${products.length}.`
      : `Позиций: ${list.length}`;

  const clinicName = escapeHtml(clinic?.name || "Клиника");
  const clinicMeta = escapeHtml([clinic?.role, clinic?.city, clinic?.address].filter(Boolean).join(" · "));
  const formedAt = escapeHtml(new Date().toLocaleDateString("ru-RU"));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Jost", "Segoe UI", sans-serif;
      color: #2a2624;
      padding: 28px;
      margin: 0;
      background: #fff;
      font-weight: 300;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      border-bottom: 2px solid #8a6f63;
      padding-bottom: 14px;
      margin-bottom: 24px;
    }
    .title {
      font-family: "Cormorant Garamond", "Times New Roman", serif;
      font-size: 30px;
      color: #8a6f63;
      margin: 0 0 4px;
      font-weight: 400;
    }
    .subtitle { font-size: 13px; color: #7a736c; }
    .meta { text-align: right; font-size: 12px; color: #7a736c; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .card {
      border: 1px solid #e6e2df;
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #fdfbf9;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .card-img-wrap {
      width: 100%;
      height: 150px;
      background: #eeeae6;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card-img { width: 100%; height: 100%; object-fit: cover; }
    .card-no-img { font-size: 12px; color: #999; }
    .card-content {
      padding: 12px 14px 14px;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      justify-content: space-between;
      gap: 10px;
    }
    .card-title {
      font-weight: 500;
      font-size: 14px;
      margin-bottom: 6px;
      color: #2a2624;
      line-height: 1.35;
    }
    .card-desc {
      font-size: 11px;
      color: #7a736c;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      border-top: 1px solid #eee;
      padding-top: 10px;
    }
    .card-price { font-weight: 500; font-size: 14px; color: #8a6f63; }
    .card-stock {
      font-size: 10px;
      color: #7a736c;
      background: #eeeae6;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .empty { color: #7a736c; font-size: 14px; padding: 24px 0; }
    .footer-page {
      text-align: right;
      font-size: 10px;
      color: #999;
      margin-top: 28px;
    }
    @media print {
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Каталог — ${escapeHtml(filterLabel)}</h1>
      <div class="subtitle">${clinicName}${clinicMeta ? ` — ${clinicMeta}` : ""}</div>
    </div>
    <div class="meta">Дата формирования: ${formedAt}</div>
  </div>

  ${
    list.length
      ? `<div class="grid">${cardsHtml}</div>`
      : `<div class="empty">В каталоге пока нет позиций.</div>`
  }

  <div class="footer-page">${escapeHtml(truncatedNote)} · Сформировано автоматически</div>
</body>
</html>`;
}
