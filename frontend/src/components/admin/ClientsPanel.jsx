import { useState } from "react";
import * as shop from "../../lib/shop.js";
import { formatOrderDate } from "./format.js";

const matches = (client, rawQuery) => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const digits = query.replace(/\D/g, "");
  const nameMatch = String(client.name || "").toLowerCase().includes(query);
  const phoneMatch = digits
    ? String(client.phone || "").includes(digits) ||
      String(client.phoneDisplay || "").replace(/\D/g, "").includes(digits)
    : String(client.phoneDisplay || "").toLowerCase().includes(query);
  return nameMatch || phoneMatch;
};

export default function ClientsPanel() {
  const [query, setQuery] = useState("");
  const clients = shop.getClients().filter((client) => matches(client, query));

  return (
    <div className="admin-panel">
      <div className="admin-clients">
        <div className="admin-clients__head">
          <div>
            <h2>Клиенты</h2>
            <p className="admin-clients__intro">
              База собирается из заявок по телефону. Сумма без отменённых заказов. Имя берётся из последнего заказа.
            </p>
          </div>
          <label className="admin-clients__search">
            Поиск
            <input
              type="search"
              placeholder="Имя или телефон"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="admin-clients__list">
          {clients.length ? (
            clients.map((client) => {
              const whatsappUrl = shop.getAdminWhatsAppClientUrl(client);
              return (
                <article className="admin-client" key={client.id}>
                  <div className="admin-client__top">
                    <div>
                      <h3 className="admin-client__name">{client.name || "Без имени"}</h3>
                      <p className="admin-client__phone">
                        <a href={client.phone ? `tel:+${client.phone}` : "#"}>{client.phoneDisplay || client.phone}</a>
                      </p>
                    </div>
                    <div className="admin-client__actions">
                      {whatsappUrl && (
                        <a
                          className="admin-btn admin-btn--whatsapp"
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                  <ul className="admin-client__stats">
                    <li>
                      <span>Заказов</span>
                      <strong>{client.ordersCount}</strong>
                    </li>
                    <li>
                      <span>Сумма</span>
                      <strong>{shop.formatPrice(client.totalSpent)}</strong>
                    </li>
                    <li>
                      <span>Открытых</span>
                      <strong>{client.openOrders}</strong>
                    </li>
                    <li>
                      <span>Последний заказ</span>
                      <strong>{formatOrderDate(client.lastOrderAt)}</strong>
                    </li>
                  </ul>
                </article>
              );
            })
          ) : (
            <p className="admin-empty">
              {query.trim()
                ? "Клиенты по запросу не найдены."
                : "Клиентов пока нет. Они появятся после первых заказов."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
