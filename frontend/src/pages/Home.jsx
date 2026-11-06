import { useCallback, useState } from "react";
import SiteShell from "../components/Layout.jsx";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import ShopSection from "../components/home/ShopSection.jsx";
import CartDrawer from "../components/home/CartDrawer.jsx";
import OrderModal from "../components/home/OrderModal.jsx";
import NavModal from "../components/home/NavModal.jsx";
import Reviews from "../components/home/Reviews.jsx";
import BookingForm from "../components/home/BookingForm.jsx";
import * as shop from "../lib/shop.js";
import { useBodyClass, useEscape, useReveal, useShopVersion } from "../lib/hooks.js";
import { ADDRESS, MAP_WIDGET_URL, MAPS_URL, PROCEDURES } from "../lib/site.js";

const SectionFallback = ({ title, reset }) => (
  <div className="section-error" role="alert">
    <p>{title} временно недоступен.</p>
    <button type="button" onClick={reset}>
      Перезагрузить блок
    </button>
  </div>
);

const WORKS = [
  {
    title: "Биоревитализация",
    note: "Увлажнение и более свежий тон лица",
    alt: "биоревитализации",
    before: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=700&q=80",
    after: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=700&q=80"
  },
  {
    title: "Чистка лица",
    note: "Чистые поры и ровный рельеф",
    alt: "чистки лица",
    before: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?auto=format&fit=crop&w=700&q=80",
    after: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=700&q=80"
  },
  {
    title: "Мезотерапия",
    note: "Тонус и более плотная текстура кожи",
    alt: "мезотерапии",
    before: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=700&q=80",
    after: "https://images.unsplash.com/photo-1522337360788-8b23ee6e025d?auto=format&fit=crop&w=700&q=80"
  }
];

const CONTACT_LINKS = [
  { hint: "Телефон", label: "8-928-448-24-25", href: "tel:+79284482425" },
  { hint: "Telegram", label: "@yana_ivi", href: "https://t.me/yana_ivi", external: true },
  { hint: "WhatsApp", label: "8-928-448-24-25", href: "https://wa.me/79284482425", external: true },
  {
    hint: "MAX",
    label: "8-928-448-24-25",
    href: "https://max.ru/",
    external: true,
    title: "Найдите контакт в MAX по номеру 8-928-448-24-25"
  },
  { hint: "Почта", label: "vdpo10@yandex.ru", href: "mailto:vdpo10@yandex.ru" }
];

const external = { target: "_blank", rel: "noopener noreferrer" };

function Hero({ onOpenNav }) {
  return (
    <section className="hero">
      <div className="hero__content">
        <p className="hero__role reveal">
          <span>Косметолог-эстетист</span>
        </p>
        <h1 className="hero__name reveal">
          <span className="hero__firstname">Яна Сергеевна</span>
          <span className="hero__lastname">Землина</span>
        </h1>
        <p className="hero__lead reveal">
          Бережный уход и эстетические процедуры для здоровой, сияющей кожи — от чисток до мезотерапии и восстановления.
        </p>
        <div className="hero__actions reveal">
          <a className="btn btn--primary" href="#booking">
            Записаться
          </a>
          <a className="btn btn--ghost" href="./procedures.html">
            Процедуры
          </a>
          <a className="btn btn--ghost" href="#shop">
            Магазин
          </a>
        </div>
        <div className="hero__meta reveal">
          <a className="hero__meta-link" href="#works">
            Смотреть результаты процедур
          </a>
          <a className="hero__meta-link" href="#reviews">
            Читать отзывы
          </a>
          <button className="hero__meta-link hero__meta-link--btn" type="button" onClick={onOpenNav}>
            Разделы сайта
          </button>
          <p className="hero__address">
            <span>Адрес кабинета</span>
            <a href={MAPS_URL} {...external}>
              {ADDRESS}
            </a>
          </p>
        </div>
      </div>

      <div className="hero__portrait reveal">
        <img src="/yana.jpg" alt="Яна Сергеевна Землина — косметолог-эстетист" />
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="about" id="about">
      <div className="about__grid">
        <div className="about__label reveal reveal--left">
          <span className="eyebrow">Образование</span>
          <p className="about__aside">
            Медицинская база
            <br />и эстетическая
            <br />
            деликатность
          </p>
        </div>
        <div className="about__main">
          <h2 className="section-title reveal reveal--right">
            Забота, точность
            <br />и профессиональный подход
          </h2>
          <p className="about__text reveal reveal--fade">
            Окончила Кубанский институт профессионального образования по специальности «Сестринское дело». Прошла
            повышение квалификации «Сестринское дело в косметологии». В работе сочетаю медицинский подход и
            эстетическую деликатность — подбираю процедуры под состояние кожи и ваши задачи.
          </p>
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section className="services" id="services">
      <div className="services__head">
        <p className="eyebrow reveal">Специализация</p>
        <h2 className="section-title reveal">Процедуры</h2>
        <p className="services__intro reveal">
          Инъекционные и аппаратные методики, а также уходовые протоколы для очищения, увлажнения и восстановления
          кожи.{" "}
          <a className="services__more" href="./procedures.html">
            Подробное описание процедур →
          </a>
        </p>
      </div>

      <ul className="services__list">
        {PROCEDURES.map((item, index) => (
          <li className="service reveal" key={item.id}>
            <span className="service__num">{String(index + 1).padStart(2, "0")}</span>
            <div className="service__body">
              <div className="service__title-row">
                <h3>{item.title}</h3>
                <p className="service__price">{item.price}</p>
              </div>
              <p>{item.short}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Works() {
  return (
    <section className="works" id="works">
      <div className="works__head">
        <p className="eyebrow reveal">Результаты</p>
        <h2 className="section-title reveal">Примеры работ</h2>
        <p className="works__intro reveal">
          Примеры визуального эффекта процедур. На сайте — демонстрационные фото; рабочие кейсы кабинета можно заменить
          на ваши.
        </p>
      </div>
      <div className="works__grid">
        {WORKS.map((work, index) => (
          <article className="works__case reveal reveal--scale" key={work.title}>
            <div className="works__pair" aria-label="До и после">
              <figure className="works__shot">
                <img src={work.before} alt={`Кожа до ${work.alt}`} loading="lazy" />
                <figcaption>До</figcaption>
              </figure>
              <figure className="works__shot">
                <img src={work.after} alt={`Кожа после ${work.alt}`} loading="lazy" />
                <figcaption>После</figcaption>
              </figure>
            </div>
            <div className="works__meta">
              <span className="works__num">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="works__title">{work.title}</h3>
              <p className="works__note">{work.note}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section className="contact" id="contact">
      <div className="contact__panel reveal">
        <div className="contact__copy">
          <p className="eyebrow">Контакты</p>
          <h2 className="section-title section-title--light">
            Запишитесь
            <br />
            на консультацию
          </h2>
          <p className="contact__text">
            Выберите процедуру, удобный день и время — заявка сразу появится в CRM и продублируется в Telegram.
          </p>
          <a className="contact__address" href={MAPS_URL} {...external}>
            {ADDRESS}
          </a>
        </div>
        <div className="contact__links">
          {CONTACT_LINKS.map((link) => (
            <a
              key={link.hint}
              className="contact__link"
              href={link.href}
              title={link.title}
              {...(link.external ? external : {})}
            >
              <span className="contact__hint">{link.hint}</span>
              <span>{link.label}</span>
            </a>
          ))}
        </div>
      </div>

      <ErrorBoundary name="запись" fallback={({ reset }) => <SectionFallback title="Форма записи" reset={reset} />}>
        <BookingForm />
      </ErrorBoundary>

      <div className="map reveal" id="map">
        <div className="map__head">
          <p className="eyebrow">Как найти</p>
          <a className="map__link" href={MAPS_URL} {...external}>
            Открыть адрес в Яндекс Картах — {ADDRESS}
          </a>
        </div>
        <div className="map__frame">
          <iframe title="Яндекс Карта — Бульвар Клары Лучко, 8" src={MAP_WIDGET_URL} loading="lazy" allowFullScreen />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  useShopVersion();
  useReveal([]);

  const [navOpen, setNavOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  const closeAll = useCallback(() => {
    setNavOpen(false);
    setCartOpen(false);
    setOrderOpen(false);
  }, []);

  useEscape(closeAll);
  useBodyClass("is-modal-open", navOpen || cartOpen || orderOpen);

  const checkout = () => {
    if (!shop.getCartLines().length) return;
    setCartOpen(false);
    setOrderOpen(true);
  };

  return (
    <SiteShell
      home
      cartCount={shop.getCartCount()}
      onCartOpen={() => setCartOpen(true)}
      overlays={
        <>
          <OrderModal open={orderOpen} onClose={() => setOrderOpen(false)} />
          <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} onCheckout={checkout} />
          <NavModal open={navOpen} onClose={() => setNavOpen(false)} />
        </>
      }
    >
      <main id="top">
        <Hero onOpenNav={() => setNavOpen(true)} />
        <About />
        <Services />
        <Works />
        <ErrorBoundary name="магазин" fallback={({ reset }) => <SectionFallback title="Магазин" reset={reset} />}>
          <ShopSection />
        </ErrorBoundary>
        <ErrorBoundary name="отзывы" fallback={({ reset }) => <SectionFallback title="Блок отзывов" reset={reset} />}>
          <Reviews />
        </ErrorBoundary>
        <Contact />
      </main>
    </SiteShell>
  );
}
