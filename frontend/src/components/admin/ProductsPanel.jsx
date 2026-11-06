import { useRef, useState } from "react";
import * as shop from "../../lib/shop.js";
import Dropdown from "./Dropdown.jsx";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

const TYPE_OPTIONS = [
  { value: "product", label: "Товар" },
  { value: "service", label: "Услуга" }
];

const CURRENCY_OPTIONS = [
  { value: "RUB", label: "Рубли (₽)" },
  { value: "KZT", label: "Тенге (₸)" },
  { value: "USD", label: "Доллары ($)" }
];

const EMPTY_FORM = { id: "", type: "product", name: "", description: "", price: "", stock: "10", image: "" };

const readImageFile = (file) =>
  new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Выберите файл изображения"));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      reject(new Error("Файл слишком большой. Максимум 4 МБ"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 900 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });

const formTitle = (form) => {
  const noun = form.type === "service" ? "услугу" : "товар";
  return form.id ? `Редактировать ${noun}` : `Добавить ${noun}`;
};

export default function ProductsPanel() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageError, setImageError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogPdfPending, setCatalogPdfPending] = useState(false);
  const fileRef = useRef(null);
  const nameRef = useRef(null);
  const loadedStockRef = useRef(null);

  const products = shop.getProducts();
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageError("");
    loadedStockRef.current = null;
  };

  const handleImageFile = async (file) => {
    try {
      set("image", await readImageFile(file));
      setImageError("");
    } catch (error) {
      setImageError(error.message || "Ошибка загрузки фото");
    }
  };

  const edit = (product) => {
    const type = shop.normalizeItemType(product.type);
    const stockValue = type === "service" ? "" : String(shop.getProductStock(product) ?? 0);
    loadedStockRef.current = type === "service" ? null : Number(stockValue);
    setForm({
      id: product.id,
      type,
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      stock: stockValue,
      image: product.image || ""
    });
    setImageError("");
    nameRef.current?.focus();
  };

  const remove = async (product) => {
    if (!window.confirm(`Удалить товар «${product.name}»?`)) return;
    try {
      await shop.deleteProduct(product.id);
      if (form.id === product.id) resetForm();
    } catch (error) {
      window.alert(error.message || "Не удалось удалить");
    }
  };

  const seed = async () => {
    if (!window.confirm("Заменить весь текущий каталог шестью примерами? Текущие позиции будут удалены.")) return;
    try {
      await shop.saveProducts(shop.DEFAULT_PRODUCTS, { overwriteStock: true });
      resetForm();
    } catch (error) {
      window.alert(error.message || "Не удалось загрузить примеры");
    }
  };

  const downloadCatalogPdf = async () => {
    setCatalogPdfPending(true);
    try {
      await shop.downloadCatalogPdf("all");
    } catch (error) {
      window.alert(error.message || "Не удалось скачать каталог PDF");
    } finally {
      setCatalogPdfPending(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.image) {
      setImageError("Добавьте фото товара");
      return;
    }
    const price = Number(form.price);
    if (!form.name.trim()) return;
    if (!Number.isFinite(price) || price <= 0) {
      setImageError("Укажите цену больше нуля (в рублях)");
      return;
    }

    const type = shop.normalizeItemType(form.type);
    let stock = null;
    if (type === "product") {
      const parsed = Math.round(Number(form.stock));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setImageError("Укажите остаток (0 или больше)");
        return;
      }
      stock = parsed;
    }

    const isNew = !form.id;
    const touchStock =
      type === "product" &&
      (isNew || loadedStockRef.current === null || Number(stock) !== Number(loadedStockRef.current));

    setSaving(true);
    try {
      await shop.upsertProduct(
        {
          id: form.id || shop.createProductId(),
          type,
          name: form.name.trim(),
          description: form.description.trim(),
          price: Math.round(price),
          stock,
          image: form.image.trim()
        },
        { touchStock }
      );
      resetForm();
    } catch (error) {
      setImageError(error.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const onDrag = (active) => (event) => {
    event.preventDefault();
    setDragOver(active);
  };

  return (
    <div className="admin-panel">
      <div className="admin-products">
        <form className="admin-form" onSubmit={submit}>
          <h2>{formTitle(form)}</h2>

          <div className="field">
            <span className="field__label">Тип</span>
            <Dropdown
              value={form.type}
              options={TYPE_OPTIONS}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  type: value,
                  stock: value === "service" ? "" : current.stock || "10"
                }))
              }
            />
          </div>

          <label>
            Название
            <input
              ref={nameRef}
              type="text"
              required
              maxLength={120}
              placeholder="Например: Сыворотка"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </label>

          <label>
            Описание
            <textarea
              rows={3}
              maxLength={400}
              placeholder="Кратко о товаре"
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </label>

          <label>
            Цена <span>(всегда в рублях)</span>
            <input
              type="number"
              min="0"
              step="1"
              required
              placeholder="2500"
              value={form.price}
              onChange={(event) => set("price", event.target.value)}
              onWheel={(event) => event.currentTarget.blur()}
            />
          </label>

          {form.type === "product" && (
            <label>
              Остаток на складе <span>(шт.)</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                placeholder="10"
                value={form.stock}
                onChange={(event) => set("stock", event.target.value)}
                onWheel={(event) => event.currentTarget.blur()}
              />
            </label>
          )}

          <div className="field">
            <span className="field__label">Валюта отображения на сайте</span>
            <p className="field__hint">
              Не меняет цену в базе — только как посетители видят суммы. Цену выше всегда вводите в рублях.
            </p>
            <Dropdown value={shop.getCurrency().code} options={CURRENCY_OPTIONS} onChange={shop.setCurrency} />
          </div>

          <div className="field">
            <span className="field__label">Фото товара</span>
            <input
              type="file"
              accept="image/*"
              hidden
              ref={fileRef}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImageFile(file);
                event.target.value = "";
              }}
            />
            <div
              className={`dropzone${dragOver ? " is-dragover" : ""}`}
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragEnter={onDrag(true)}
              onDragOver={onDrag(true)}
              onDragLeave={onDrag(false)}
              onDragEnd={onDrag(false)}
              onDrop={(event) => {
                onDrag(false)(event);
                const file = event.dataTransfer?.files?.[0];
                if (file) handleImageFile(file);
              }}
            >
              <div className="dropzone__preview" hidden={!form.image}>
                {form.image && <img src={form.image} alt="Превью фото" />}
                <button
                  className="dropzone__remove"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    set("image", "");
                    setImageError("");
                  }}
                >
                  Убрать
                </button>
              </div>
              <div className="dropzone__placeholder" hidden={Boolean(form.image)}>
                <p className="dropzone__title">Перетащите фото сюда</p>
                <p className="dropzone__hint">или нажмите, чтобы выбрать с компьютера</p>
                <span className="dropzone__formats">JPG, PNG, WEBP</span>
              </div>
            </div>
            <p className="dropzone__error" hidden={!imageError}>
              {imageError}
            </p>
          </div>

          <div className="admin-form__actions">
            <button className="admin-btn" type="submit" disabled={saving}>
              Сохранить
            </button>
            <button className="admin-btn admin-btn--ghost" type="button" onClick={resetForm}>
              Очистить
            </button>
            <button className="admin-btn admin-btn--ghost" type="button" onClick={seed}>
              Загрузить 6 примеров
            </button>
            <button
              className="admin-btn"
              type="button"
              disabled={catalogPdfPending || !products.length}
              title={products.length ? "Скачать PDF-каталог" : "Сначала добавьте товары"}
              onClick={downloadCatalogPdf}
            >
              {catalogPdfPending ? "Формируем PDF…" : "Скачать каталог (PDF)"}
            </button>
          </div>
        </form>

        <div className="admin-list-wrap">
          <div className="admin-list-wrap__head">
            <h2>Список позиций</h2>
            <button
              className="admin-btn admin-btn--ghost"
              type="button"
              disabled={catalogPdfPending || !products.length}
              title={products.length ? "Скачать PDF-каталог" : "Сначала добавьте товары"}
              onClick={downloadCatalogPdf}
            >
              {catalogPdfPending ? "PDF…" : "PDF-каталог"}
            </button>
          </div>
          <div className="admin-list">
            {products.length ? (
              products.map((product) => (
                <article className="admin-item" key={product.id}>
                  <img src={product.image} alt="" />
                  <div>
                    <h3>{product.name}</h3>
                    <p>
                      {shop.getTypeLabel(product.type)} · {shop.formatPrice(product.price)}
                      {shop.normalizeItemType(product.type) === "product"
                        ? ` · остаток ${shop.getProductStock(product) ?? 0}`
                        : ""}
                    </p>
                  </div>
                  <div className="admin-item__actions">
                    <button className="admin-btn admin-btn--ghost" type="button" onClick={() => edit(product)}>
                      Изменить
                    </button>
                    <button className="admin-btn admin-btn--danger" type="button" onClick={() => remove(product)}>
                      Удалить
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="admin-empty">Товаров пока нет. Добавьте первый.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
