import { formatDate, formatMoney } from "../lib/format.js";

const ACCENT = "#8a6f63";
const INK = "#2a2624";
const MUTED = "#7a736c";
const LINE = "#e8e2dc";

export function buildInvoiceDoc(order, clinic) {
  const isBooking = order.kind === "booking" || order.channel === "booking";
  const title = isBooking ? "Подтверждение записи" : "Счёт / квитанция";
  const currency = order.currency || "RUB";
  const items = Array.isArray(order.items) ? order.items : [];

  const itemRows =
    items.length > 0
      ? items.map((item) => [
          { text: String(item?.name || "—"), style: "td" },
          { text: String(item?.quantity ?? 1), style: "td", alignment: "center" },
          {
            text:
              isBooking && !(Number(item?.price) > 0)
                ? "по запросу"
                : formatMoney(item?.price, currency),
            style: "td",
            alignment: "right"
          },
          {
            text:
              isBooking && !(Number(item?.lineTotal) > 0)
                ? "по запросу"
                : formatMoney(item?.lineTotal, currency),
            style: "td",
            alignment: "right"
          }
        ])
      : [
          [
            { text: "Нет позиций", style: "td", colSpan: 4, alignment: "center" },
            {},
            {},
            {}
          ]
        ];

  const tableBody = [
    [
      { text: "Наименование", style: "th" },
      { text: "Кол-во", style: "th", alignment: "center" },
      { text: "Цена", style: "th", alignment: "right" },
      { text: "Сумма", style: "th", alignment: "right" }
    ],
    ...itemRows
  ];

  const bookingLines = [];
  if (isBooking && order.booking) {
    if (order.booking.procedure) bookingLines.push(`Процедура: ${order.booking.procedure}`);
    if (order.booking.date || order.booking.time) {
      bookingLines.push(
        `Дата и время: ${[order.booking.date, order.booking.time].filter(Boolean).join(" · ")}`
      );
    }
    if (order.booking.note) bookingLines.push(`Комментарий: ${order.booking.note}`);
  }

  return {
    pageSize: "A4",
    pageMargins: [48, 48, 48, 56],
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      color: INK,
      lineHeight: 1.35
    },
    styles: {
      brand: { fontSize: 20, color: ACCENT, bold: true, margin: [0, 0, 0, 4] },
      role: { fontSize: 9, color: MUTED, margin: [0, 0, 0, 2] },
      docTitle: { fontSize: 16, color: ACCENT, bold: true, alignment: "right" },
      meta: { fontSize: 9, color: MUTED, alignment: "right" },
      section: { fontSize: 11, bold: true, margin: [0, 18, 0, 6], color: INK },
      th: { bold: true, fillColor: "#f7f4f1", color: INK, margin: [0, 4, 0, 4] },
      td: { margin: [0, 4, 0, 4] },
      total: { fontSize: 14, bold: true, color: ACCENT, alignment: "right", margin: [0, 16, 0, 0] },
      footer: { fontSize: 8, color: MUTED }
    },
    content: [
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: clinic.name || "Клиника", style: "brand" },
              { text: clinic.role || "", style: "role" },
              { text: clinic.address || "", style: "role" },
              { text: [clinic.phone, clinic.email].filter(Boolean).join(" · "), style: "role" }
            ]
          },
          {
            width: "auto",
            stack: [
              { text: title, style: "docTitle" },
              { text: `№ ${order.id}`, style: "meta", margin: [0, 8, 0, 0] },
              { text: `Дата: ${formatDate(order.createdAt)}`, style: "meta" }
            ]
          }
        ]
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 1.5, lineColor: ACCENT }],
        margin: [0, 16, 0, 8]
      },
      { text: "Клиент", style: "section" },
      {
        text: [
          { text: "Имя: ", bold: true },
          `${order.customer?.name || "—"}`
        ]
      },
      {
        text: [
          { text: "Телефон: ", bold: true },
          `${order.customer?.phoneDisplay || order.customer?.phone || "—"}`
        ],
        margin: [0, 2, 0, 0]
      },
      ...(bookingLines.length
        ? [{ text: "Запись", style: "section" }, { text: bookingLines.join("\n") }]
        : []),
      { text: "Состав", style: "section" },
      {
        table: {
          headerRows: 1,
          widths: ["*", 48, 72, 72],
          body: tableBody
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
          vLineWidth: () => 0,
          hLineColor: () => LINE,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4
        }
      },
      ...(isBooking && !order.total
        ? [{ text: "Стоимость — по запросу", style: "total" }]
        : [{ text: `Итого: ${formatMoney(order.total, currency)}`, style: "total" }]),
      {
        text: "Документ сформирован автоматически. Не является счёт-фактурой для НДС.",
        style: "footer",
        margin: [0, 28, 0, 0]
      }
    ]
  };
}
