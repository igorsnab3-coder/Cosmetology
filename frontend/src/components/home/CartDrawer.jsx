import { useEffect, useState } from "react";
import * as shop from "../../lib/shop.js";

export default function CartDrawer({ open, onClose, onCheckout }) {
  const lines = shop.getCartLines();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) setError("");
  }, [open]);

  const run = (action) => () => {
    try {
      action();
      setError("");
    } catch (err) {
      setError(err?.message || "Не удалось изменить корзину");
    }
  };

  return (
    <div className="cart-drawer" hidden={!open}>
      <div className="cart-drawer__backdrop" onClick={onClose} />
      <aside className="cart-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="cart-drawer__head">
          <h2 id="cart-title">Корзина</h2>
          <button className="cart-drawer__close" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="cart-drawer__list">
          {lines.length ? (
            lines.map((item) => (
              <article className="cart-item" key={item.id}>
                <img src={item.image} alt={item.name} />
                <div>
                  <p className="cart-item__type">{shop.getTypeLabel(item.type)}</p>
                  <h3 className="cart-item__name">{item.name}</h3>
                  <p className="cart-item__price">
                    {shop.formatPrice(item.price)} × {item.quantity} = {shop.formatPrice(item.lineTotal)}
                  </p>
                  <div className="cart-item__row">
                    <div className="cart-item__qty">
                      <button
                        type="button"
                        aria-label="Уменьшить"
                        onClick={run(() => shop.changeCartQuantity(item.id, -1))}
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Увеличить"
                        onClick={run(() => shop.changeCartQuantity(item.id, 1))}
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="cart-item__remove"
                      type="button"
                      onClick={run(() => shop.removeFromCart(item.id))}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="cart-empty">Корзина пуста. Добавьте товары из раздела «Магазин».</p>
          )}
        </div>
        <div className="cart-drawer__footer">
          <div className="cart-drawer__total">
            <span>Итого</span>
            <strong>{shop.formatPrice(shop.getCartTotal())}</strong>
          </div>
          <p className="cart-drawer__error" role="alert" hidden={!error}>
            {error}
          </p>
          <div className="cart-drawer__actions">
            <button className="btn btn--primary" type="button" disabled={!lines.length} onClick={onCheckout}>
              Оформить заказ
            </button>
            <button className="btn btn--ghost" type="button" disabled={!lines.length} onClick={run(shop.clearCart)}>
              Очистить
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
