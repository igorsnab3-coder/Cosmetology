import { useEffect, useRef, useState } from "react";
import * as shop from "../../lib/shop.js";

export default function OrderModal({ open, onClose }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState("");
  const nameRef = useRef(null);
  const channelRef = useRef("whatsapp");
  const busyRef = useRef(false);

  const closeTimerRef = useRef(0);
  const [fallbackUrl, setFallbackUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    window.clearTimeout(closeTimerRef.current);
    setName("");
    setPhone("");
    setError("");
    setDoneId("");
    setFallbackUrl("");
    setBusy(false);
    busyRef.current = false;
    nameRef.current?.focus();
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const summary = open
    ? `Заказ из корзины: ${shop.getCartCount()} поз. — ${shop.formatPrice(shop.getCartTotal())}`
    : "";

  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    const channel = channelRef.current;
    const customer = { name: name.trim(), phone: phone.trim() };

    if (!shop.isValidCustomer(customer)) {
      setError("Укажите имя и корректный номер телефона");
      return;
    }

    setError("");
    setDoneId("");
    setFallbackUrl("");
    busyRef.current = true;
    setBusy(true);
    try {
      const order = await shop.placeCartOrder(customer, channel);
      setDoneId(order?.id || "");
      if (order?.telegramNotify === false && order?.notifyFallbackUrl) {
        setFallbackUrl(order.notifyFallbackUrl);
      }
      // Brief confirmation so a blocked messenger popup is not a dead end.
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message || "Не удалось оформить заказ");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="order-modal" hidden={!open}>
      <div className="order-modal__backdrop" onClick={onClose} />
      <div className="order-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
        <div className="order-modal__head">
          <h2 id="order-modal-title">Оформить заказ</h2>
          <button className="order-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="order-modal__product">{summary}</p>
        <form className="order-modal__form" onSubmit={submit}>
          <label className="order-modal__field">
            Имя
            <input
              ref={nameRef}
              type="text"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              placeholder="Как к вам обращаться"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="order-modal__field">
            Номер телефона
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              required
              maxLength={20}
              placeholder="+7 (___) ___-__-__"
              value={phone}
              onChange={(event) => setPhone(shop.maskPhoneInput(event.target.value))}
            />
          </label>
          <p className="order-modal__error" hidden={!error}>
            {error}
          </p>
          <p className="order-modal__hint" hidden={Boolean(doneId)}>
            Укажите контакты — заказ сохранится, и откроется чат с готовым текстом.
          </p>
          <p className="order-modal__hint" hidden={!doneId}>
            Заказ принят{doneId ? ` (№ ${doneId.slice(0, 12)}…)` : ""}. Если чат не открылся — напишите нам сами.
          </p>
          {fallbackUrl ? (
            <p className="order-modal__hint">
              Уведомление в Telegram не подтверждено.{" "}
              <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
                Открыть чат вручную
              </a>
            </p>
          ) : null}
          <div className="order-modal__actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={busy || Boolean(doneId)}
              onClick={() => (channelRef.current = "whatsapp")}
            >
              WhatsApp
            </button>
            <button
              className="btn btn--ghost"
              type="submit"
              disabled={busy || Boolean(doneId)}
              onClick={() => (channelRef.current = "telegram")}
            >
              Telegram
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
