import { useState } from "react";
import * as shop from "../../lib/shop.js";
import { formatOrderDate } from "./format.js";

const FILTERS = [
  { code: "all", label: "Все" },
  { code: "new", label: "Новые" },
  { code: "in_progress", label: "В работе" },
  { code: "done", label: "Выполненные" },
  { code: "cancelled", label: "Отменённые" }
];

function OrderCard({ order }) {
  const [pending, setPending] = useState(false);
  const [pdfPending, setPdfPending] = useState(false);
  const isBooking = order.kind === "booking" || order.channel === "booking";
  const channelLabel = isBooking ? "Запись" : order.channel === "telegram" ? "Telegram" : "WhatsApp";
  const phone = order.customer?.phoneDisplay || shop.formatPhoneDisplay(order.customer?.phone);
  const phoneHref = order.customer?.phone ? `tel:+${order.customer.phone}` : "#";
  const booking = order.booking || {};
  const whatsappUrl = shop.getAdminWhatsAppFollowUpUrl(order);
  const statusClass = shop.ORDER_STATUSES[order.status] ? order.status : "new";

  const changeStatus = async (event) => {
    setPending(true);
    try {
      await shop.updateOrderStatus(order.id, event.target.value);
    } catch (error) {
      window.alert(error.message || "Не удалось обновить статус");
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Удалить этот заказ из учёта?")) return;
    setPending(true);
    try {
      await shop.deleteOrder(order.id);
    } catch (error) {
      window.alert(error.message || "Не удалось удалить заказ");
      setPending(false);
    }
  };

  const downloadPdf = async () => {
    setPdfPending(true);
    try {
      await shop.downloadOrderPdf(order.id);
    } catch (error) {
      window.alert(error.message || "Не удалось скачать PDF");
    } finally {
      setPdfPending(false);
    }
  };

  return (
    <article className={`admin-order${isBooking ? " admin-order--booking" : ""}`}>
      <div className="admin-order__top">
        <div className="admin-order__meta">
          <p className="admin-order__id">
            {isBooking ? "Запись" : "Заказ"} {order.id}
          </p>
          <h3 className="admin-order__client">{order.customer?.name || "Без имени"}</h3>
          <p className="admin-order__phone">
            <a href={phoneHref}>{phone}</a>
          </p>
          {isBooking && (booking.date || booking.time) && (
            <p className="admin-order__slot">
              {[shop.formatBookingDateLabel(booking.date) || booking.date, booking.time].filter(Boolean).join(" · ")}
              {booking.note ? ` — ${booking.note}` : ""}
            </p>
          )}
          <p className="admin-order__date">{formatOrderDate(order.createdAt)}</p>
        </div>
        <div className="admin-order__badges">
          <span className={`admin-badge admin-badge--${statusClass}`}>{shop.getOrderStatusLabel(order.status)}</span>
          <span className={`admin-badge${isBooking ? " admin-badge--booking" : ""}`}>{channelLabel}</span>
        </div>
      </div>
      <ul className="admin-order__items">
        {(order.items || []).map((item, index) => (
          <li key={`${item.id}-${index}`}>
            <span>
              {shop.getTypeLabel(item.type)}: {item.name} × {item.quantity}
            </span>
            <span>{isBooking && !item.lineTotal ? "по запросу" : shop.formatPrice(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      {!isBooking && <p className="admin-order__total">Итого: {shop.formatPrice(order.total)}</p>}
      <div className="admin-order__actions">
        <select aria-label="Статус заказа" value={order.status} disabled={pending} onChange={changeStatus}>
          {Object.values(shop.ORDER_STATUSES).map((status) => (
            <option key={status.code} value={status.code}>
              {status.label}
            </option>
          ))}
        </select>
        {whatsappUrl && (
          <a className="admin-btn admin-btn--whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        )}
        <button
          className="admin-btn admin-btn--pdf"
          type="button"
          disabled={pending || pdfPending}
          onClick={downloadPdf}
        >
          {pdfPending ? "PDF…" : "Скачать PDF"}
        </button>
        <button className="admin-btn admin-btn--danger" type="button" disabled={pending} onClick={remove}>
          Удалить
        </button>
      </div>
    </article>
  );
}

export default function OrdersPanel({ refreshing, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const orders = shop.getOrders().filter((order) => filter === "all" || order.status === filter);

  return (
    <div className="admin-panel">
      <div className="admin-orders">
        <div className="admin-orders__head">
          <div>
            <h2>Учёт заказов</h2>
            <p className="admin-orders__intro">
              Заказы и онлайн-записи сохраняются автоматически. Дубль уходит в Telegram @yana_ivi через бота
              (TELEGRAM_BOT_TOKEN в .env).
            </p>
          </div>
          <div className="admin-orders__toolbar">
            <button className="admin-btn admin-btn--ghost" type="button" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? "Обновление…" : "Обновить"}
            </button>
            <div className="admin-orders__filters">
              {FILTERS.map((item) => (
                <button
                  key={item.code}
                  className={`admin-filter${filter === item.code ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setFilter(item.code)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="admin-orders__list">
          {orders.length ? (
            orders.map((order) => <OrderCard key={order.id} order={order} />)
          ) : (
            <p className="admin-empty">
              {filter === "all"
                ? "Заказов пока нет. Они появятся, когда клиент оформит заказ на сайте."
                : "В этой категории заказов нет."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
