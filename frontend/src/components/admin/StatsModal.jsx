import { useEffect, useRef } from "react";
import * as shop from "../../lib/shop.js";
import { formatOrdersCount } from "./format.js";

const getStats = () => {
  const orders = shop.getOrders().filter((order) => order.status !== "cancelled");
  const sumBy = (predicate) =>
    orders.reduce((sum, order) => (predicate(order) ? sum + (Number(order.total) || 0) : sum), 0);
  const countBy = (predicate) => orders.filter(predicate).length;
  const isNew = (order) => order.status === "new";
  const inProgress = (order) => order.status === "in_progress";

  return [
    { key: "total", label: "Общая сумма заказов", sum: sumBy(() => true), count: orders.length },
    { key: "progress", label: "В работе", sum: sumBy(inProgress), count: countBy(inProgress) },
    { key: "new", label: "Новые", sum: sumBy(isNew), count: countBy(isNew) }
  ];
};

export default function StatsModal({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <div className="stats-modal" hidden={!open}>
      <div className="stats-modal__backdrop" onClick={onClose} />
      <div className="stats-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="stats-modal-title">
        <div className="stats-modal__head">
          <h2 id="stats-modal-title">Сводка по заказам</h2>
          <button className="stats-modal__close" type="button" aria-label="Закрыть" onClick={onClose} ref={closeRef}>
            ×
          </button>
        </div>
        <p className="stats-modal__hint">Суммы без отменённых заказов</p>
        <div className="stats-modal__grid">
          {open &&
            getStats().map((card) => (
              <article className={`stats-card stats-card--${card.key}`} key={card.key}>
                <p className="stats-card__label">{card.label}</p>
                <p className="stats-card__value">{shop.formatPrice(card.sum)}</p>
                <p className="stats-card__meta">{formatOrdersCount(card.count)}</p>
              </article>
            ))}
        </div>
      </div>
    </div>
  );
}
