import { useState } from "react";
import * as shop from "../../lib/shop.js";

const toDateInput = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const tomorrow = () => {
  const date = today();
  date.setDate(date.getDate() + 1);
  return toDateInput(date);
};

const emptyForm = () => ({
  procedureId: "",
  date: tomorrow(),
  time: "",
  name: "",
  phone: "",
  note: ""
});

export default function BookingForm() {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (field) => (event) => {
    const value = field === "phone" ? shop.maskPhoneInput(event.target.value) : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);

    const procedureName = shop.BOOKING_PROCEDURES.find((item) => item.id === form.procedureId)?.name || "";

    try {
      const order = await shop.placeBooking({
        procedureId: form.procedureId,
        procedureName,
        date: form.date,
        time: form.time,
        note: form.note.trim(),
        customer: { name: form.name.trim(), phone: form.phone }
      });

      const when = [shop.formatBookingDateLabel(order?.booking?.date || form.date), order?.booking?.time || form.time]
        .filter(Boolean)
        .join(", ");
      const procedure = order?.booking?.procedure || procedureName;

      setForm(emptyForm());
      setSuccess(`Запись принята: ${procedure}${when ? ` — ${when}` : ""}. Мы свяжемся для подтверждения.`);
    } catch (err) {
      setError(err?.message || "Не удалось отправить запись. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="booking reveal" id="booking">
      <div className="booking__head">
        <p className="eyebrow">Онлайн-запись</p>
        <h2 className="section-title">Запись на слот</h2>
        <p className="booking__intro">Процедура → день и время → контакты. Подтвердим запись ответом в мессенджере.</p>
      </div>
      <form className="booking__form" noValidate onSubmit={submit}>
        <label className="booking__field">
          Процедура
          <select name="procedure" required value={form.procedureId} onChange={update("procedureId")}>
            <option value="" disabled>
              Выберите процедуру
            </option>
            {shop.BOOKING_PROCEDURES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.priceHint ? ` — ${item.priceHint}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="booking__row">
          <label className="booking__field">
            Удобный день
            <input type="date" name="date" required min={toDateInput(today())} value={form.date} onChange={update("date")} />
          </label>
          <label className="booking__field">
            Время
            <select name="time" required value={form.time} onChange={update("time")}>
              <option value="" disabled>
                Выберите время
              </option>
              {shop.BOOKING_TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="booking__row">
          <label className="booking__field">
            Имя
            <input
              type="text"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              placeholder="Как к вам обращаться"
              value={form.name}
              onChange={update("name")}
            />
          </label>
          <label className="booking__field">
            Телефон
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              required
              maxLength={20}
              placeholder="+7 (___) ___-__-__"
              value={form.phone}
              onChange={update("phone")}
            />
          </label>
        </div>
        <label className="booking__field">
          Комментарий <span className="booking__optional">необязательно</span>
          <textarea
            name="note"
            rows={2}
            maxLength={200}
            placeholder="Пожелания или вопрос по коже"
            value={form.note}
            onChange={update("note")}
          />
        </label>
        <p className="booking__error" hidden={!error}>
          {error}
        </p>
        <p className="booking__success" hidden={!success}>
          {success}
        </p>
        <div className="booking__actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>
            Записаться
          </button>
        </div>
      </form>
    </div>
  );
}
