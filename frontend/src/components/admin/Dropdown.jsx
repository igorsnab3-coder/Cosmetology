import { useEffect, useRef, useState } from "react";

export default function Dropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  const current = options.find((option) => option.value === value) || options[0];

  return (
    <div className={`dropdown${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        className="dropdown__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <span className="dropdown__value">{current.label}</span>
        <span className="dropdown__chevron" aria-hidden="true" />
      </button>
      <ul className="dropdown__menu" role="listbox" hidden={!open}>
        {options.map((option) => (
          <li
            key={option.value}
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value}
            className={option.value === value ? "is-active" : ""}
            onClick={() => {
              setOpen(false);
              onChange(option.value);
            }}
          >
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
