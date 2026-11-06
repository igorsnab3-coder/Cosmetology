import { useEffect, useRef, useState } from "react";
import * as shop from "../../lib/shop.js";
import { useReveal, useShopVersion } from "../../lib/hooks.js";

const TYPE_FILTERS = [
  { code: "all", label: "Все" },
  { code: "product", label: "Товары" },
  { code: "service", label: "Услуги" }
];

const CURRENCY_BUTTONS = [
  { code: "RUB", label: "₽ Рубли" },
  { code: "KZT", label: "₸ Тенге" },
  { code: "USD", label: "$ Доллар" }
];

function QtyDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const list = options.length ? options : [1];

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`qty-dropdown${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        className="qty-dropdown__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!options.length}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="qty-dropdown__value">{value}</span>
        <span className="qty-dropdown__chevron" aria-hidden="true" />
      </button>
      <ul className="qty-dropdown__menu" role="listbox" hidden={!open}>
        {list.map((qty) => (
          <li
            key={qty}
            role="option"
            aria-selected={qty === value}
            className={qty === value ? "is-active" : ""}
            onClick={() => {
              onChange(qty);
              setOpen(false);
            }}
          >
            {qty}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductCard({ product }) {
  const inStock = shop.isProductInStock(product);
  const maxQty = shop.getMaxOrderQty(product);
  const qtyOptions = inStock ? Array.from({ length: maxQty }, (_, index) => index + 1) : [];
  const [quantity, setQuantity] = useState(1);
  const stock = shop.getProductStock(product);
  const isService = shop.normalizeItemType(product.type) === "service";

  useEffect(() => {
    if (!inStock) return;
    setQuantity((current) => Math.min(Math.max(1, current), maxQty || 1));
  }, [inStock, maxQty]);

  const add = () => {
    if (!inStock) return;
    try {
      shop.addToCart(product.id, quantity);
    } catch (error) {
      window.alert(error.message || "Не удалось добавить в корзину");
    }
  };

  return (
    <article className={`product-card reveal reveal--scale${inStock ? "" : " is-out-of-stock"}`}>
      <div className="product-card__image">
        <img src={product.image} alt={product.name} loading="lazy" />
        {!inStock && <span className="product-card__badge">Нет в наличии</span>}
      </div>
      <div className="product-card__body">
        <p className="product-card__type">{shop.getTypeLabel(product.type)}</p>
        <h3 className="product-card__name">{product.name}</h3>
        <p className="product-card__desc">{product.description || ""}</p>
        <p className="product-card__price">{shop.formatPrice(product.price)}</p>
        {!isService && (
          <p className="product-card__stock">
            {inStock ? `В наличии: ${stock} шт.` : "Товар закончился"}
          </p>
        )}
        {inStock ? (
          <>
            <div className="product-card__qty">
              <span className="product-card__qty-label">Количество</span>
              <QtyDropdown value={quantity} onChange={setQuantity} options={qtyOptions} />
            </div>
            <div className="product-card__actions">
              <button className="btn btn--primary product-card__btn" type="button" onClick={add}>
                В корзину
              </button>
            </div>
          </>
        ) : (
          <div className="product-card__actions">
            <button className="btn btn--primary product-card__btn" type="button" disabled>
              Недоступно
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function ShopSection() {
  useShopVersion();
  const [type, setType] = useState("all");
  const products = shop
    .getProducts()
    .filter((item) => type === "all" || shop.normalizeItemType(item.type) === type);
  const currency = shop.getCurrency().code;

  useReveal([type, products.map((item) => `${item.id}:${item.stock}`).join("|")]);

  return (
    <section className="shop" id="shop">
      <div className="shop__head">
        <p className="eyebrow reveal">Магазин</p>
        <h2 className="section-title reveal">Магазин</h2>
        <p className="shop__intro reveal">
          Товары и услуги. Выберите тип, количество, добавьте в корзину и оформите заказ в WhatsApp или Telegram.
        </p>
      </div>
      <div className="shop__toolbar reveal">
        <div className="shop__type-filter" role="group" aria-label="Показать">
          <span className="shop__type-filter-label">Показать</span>
          <div className="shop__type-buttons">
            {TYPE_FILTERS.map((item) => (
              <button
                key={item.code}
                type="button"
                className={`shop__type-btn${type === item.code ? " is-active" : ""}`}
                onClick={() => setType(item.code)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="currency-switch" role="group" aria-label="Валюта">
          {CURRENCY_BUTTONS.map((item) => (
            <button
              key={item.code}
              type="button"
              className={`currency-switch__btn${currency === item.code ? " is-active" : ""}`}
              onClick={() => shop.setCurrency(item.code)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="shop__grid">
        {products.length ? (
          products.map((product) => <ProductCard key={product.id} product={product} />)
        ) : (
          <p className="shop__empty">Пока нет позиций в этой категории.</p>
        )}
      </div>
    </section>
  );
}
