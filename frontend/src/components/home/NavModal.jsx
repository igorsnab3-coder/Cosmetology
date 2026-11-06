import { useEffect, useRef } from "react";

const LINKS = [
  { href: "#about", label: "Обо мне" },
  { href: "./procedures.html", label: "Процедуры" },
  { href: "#works", label: "Примеры работ" },
  { href: "#shop", label: "Магазин" },
  { href: "#reviews", label: "Отзывы" },
  { href: "#booking", label: "Онлайн-запись" },
  { href: "#contact", label: "Контакты" },
  { href: "#map", label: "Карта и адрес" }
];

export default function NavModal({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <div className="nav-modal" hidden={!open}>
      <div className="nav-modal__backdrop" onClick={onClose} />
      <div className="nav-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="nav-modal-title">
        <div className="nav-modal__head">
          <h2 id="nav-modal-title">Быстрый переход</h2>
          <button className="nav-modal__close" type="button" onClick={onClose} aria-label="Закрыть" ref={closeRef}>
            ×
          </button>
        </div>
        <nav className="nav-modal__links">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={onClose}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
