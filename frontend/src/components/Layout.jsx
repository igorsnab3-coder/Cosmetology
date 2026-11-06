import { useEffect, useRef, useState } from "react";
import Ambient from "./Ambient.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import Jarvis from "./jarvis/Jarvis.jsx";

function ScrollProgress({ onScrolled }) {
  const barRef = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      onScrolled(window.scrollY > 12);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const value = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (barRef.current) barRef.current.style.width = `${value}%`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScrolled]);

  return <div className="scroll-progress" aria-hidden="true" ref={barRef} />;
}

function Topbar({ home, scrolled, cartCount = 0, onCartOpen }) {
  const prefix = home ? "" : "./index.html";

  return (
    <header className={`topbar${scrolled ? " is-scrolled" : ""}`}>
      <a className="logo" href={home ? "#top" : "./index.html"}>
        Яна Землина
      </a>
      <div className="topbar__right">
        <nav className="nav">
          <a href={`${prefix}#about`}>Обо мне</a>
          <a href="./procedures.html" aria-current={home ? undefined : "page"}>
            Процедуры
          </a>
          <a href={`${prefix}#shop`}>Магазин</a>
          <a href={`${prefix}#contact`}>Контакты</a>
        </nav>
        {home ? (
          <button
            className="cart-btn"
            type="button"
            onClick={onCartOpen}
            aria-label={cartCount ? `Корзина, ${cartCount}` : "Открыть корзину"}
          >
            <span className="cart-btn__label">Корзина</span>
            <span className="cart-btn__count" hidden={cartCount <= 0}>
              {cartCount}
            </span>
          </button>
        ) : (
          <a className="cart-btn" href="./index.html#shop" aria-label="Перейти в магазин">
            <span className="cart-btn__label">Магазин</span>
          </a>
        )}
      </div>
    </header>
  );
}

function Footer({ home }) {
  const prefix = home ? "" : "./index.html";
  return (
    <footer className="footer">
      <p>© {new Date().getFullYear()} Яна Сергеевна Землина</p>
      <nav className="footer__nav">
        <a href="./procedures.html">Процедуры</a>
        <a href={`${prefix}#shop`}>Магазин</a>
        {home && <a href="#reviews">Отзывы</a>}
        <a href={`${prefix}#contact`}>Контакты</a>
        <a href="./admin.html">Админка</a>
      </nav>
      <p>Косметолог-эстетист</p>
    </footer>
  );
}

export default function SiteShell({ home = false, cartCount, onCartOpen, overlays, children }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // keep raw hash on malformed percent-encoding
    }
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <>
      <ScrollProgress onScrolled={setScrolled} />
      <div className="noise" aria-hidden="true" />
      <ErrorBoundary name="ambient" fallback={null}>
        <Ambient dna={home} />
      </ErrorBoundary>
      <Topbar home={home} scrolled={scrolled} cartCount={cartCount} onCartOpen={onCartOpen} />
      {children}
      <Footer home={home} />
      {overlays}
      <ErrorBoundary
        name="чат Jarvis"
        clearStorageKeys={["yana_jarvis_chat_v1"]}
        fallback={({ reset }) => (
          <div className="section-error" role="alert">
            <p>Чат временно недоступен.</p>
            <button type="button" onClick={reset}>
              Перезагрузить блок
            </button>
          </div>
        )}
      >
        <Jarvis />
      </ErrorBoundary>
    </>
  );
}
