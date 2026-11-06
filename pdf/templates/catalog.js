import { formatMoney } from "../lib/format.js";
import { resolveImage } from "../lib/images.js";

const ACCENT = "#8a6f63";
const INK = "#2a2624";
const MUTED = "#7a736c";
const MAX_ITEMS = 60;

function chunk(list, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

async function buildCard(product) {
  const isService = product.type === "service";
  const stockText = isService
    ? "Услуга"
    : `Остаток: ${Number.isFinite(Number(product.stock)) ? product.stock : "—"}`;

  const textStack = [
    { text: String(product.name || "—"), bold: true, fontSize: 11, color: INK, margin: [0, 0, 0, 2] },
    { text: formatMoney(product.price, "RUB"), color: ACCENT, fontSize: 11, bold: true, margin: [0, 0, 0, 2] },
    { text: stockText, fontSize: 8, color: MUTED, margin: [0, 0, 0, 4] },
    {
      text: String(product.description || "").trim() || " ",
      fontSize: 8,
      color: MUTED
    }
  ];

  try {
    const image = await resolveImage(product.image);
    const dataUrl = `data:image/${image.format};base64,${image.content}`;
    return {
      margin: [0, 0, 10, 14],
      stack: [{ image: dataUrl, fit: [220, 140], margin: [0, 0, 0, 8] }, ...textStack]
    };
  } catch {
    return {
      margin: [0, 0, 10, 14],
      stack: [
        {
          text: "Нет фото",
          alignment: "center",
          color: MUTED,
          margin: [0, 40, 0, 40],
          fontSize: 9
        },
        ...textStack
      ]
    };
  }
}

export async function buildCatalogDoc(products, clinic, { typeFilter = "all" } = {}) {
  const cols = 2;
  const source = Array.isArray(products) ? products.slice(0, MAX_ITEMS) : [];
  const prepared = [];

  for (const product of source) {
    prepared.push(await buildCard(product));
  }

  const rows = chunk(prepared, cols).map((row) => {
    const cells = row.slice();
    while (cells.length < cols) cells.push({ text: "" });
    return {
      columns: cells.map((cell) => ({ width: "*", ...cell })),
      columnGap: 12,
      margin: [0, 0, 0, 4]
    };
  });

  const filterLabel =
    typeFilter === "product" ? "Товары" : typeFilter === "service" ? "Услуги" : "Товары и услуги";

  const truncatedNote =
    Array.isArray(products) && products.length > MAX_ITEMS
      ? `Показаны первые ${MAX_ITEMS} из ${products.length}.`
      : `Позиций: ${source.length}`;

  return {
    pageSize: "A4",
    pageMargins: [40, 44, 40, 48],
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      color: INK,
      lineHeight: 1.3
    },
    content: [
      { text: clinic.name || "Каталог", fontSize: 20, color: ACCENT, bold: true },
      {
        text: [clinic.role, clinic.city].filter(Boolean).join(" · "),
        fontSize: 9,
        color: MUTED,
        margin: [0, 2, 0, 2]
      },
      {
        text: clinic.address || "",
        fontSize: 9,
        color: MUTED,
        margin: [0, 0, 0, 4]
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: ACCENT }],
        margin: [0, 8, 0, 12]
      },
      {
        text: `Каталог — ${filterLabel}`,
        fontSize: 14,
        bold: true,
        margin: [0, 0, 0, 12]
      },
      ...(rows.length ? rows : [{ text: "В каталоге пока нет позиций.", color: MUTED }]),
      {
        text: truncatedNote,
        fontSize: 8,
        color: MUTED,
        margin: [0, 16, 0, 0]
      }
    ]
  };
}
