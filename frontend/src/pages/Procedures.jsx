import SiteShell from "../components/Layout.jsx";
import { useReveal } from "../lib/hooks.js";
import { PROCEDURES } from "../lib/site.js";

export default function Procedures() {
  useReveal([]);

  return (
    <SiteShell>
      <main className="page-procedures" id="top">
        <section className="page-hero">
          <p className="eyebrow reveal">Специализация</p>
          <h1 className="section-title reveal">Процедуры</h1>
          <p className="page-hero__lead reveal">
            Подробнее о методиках, которые я использую в работе: от инъекционного увлажнения до мягких аппаратных и
            уходовых протоколов.
          </p>
          <div className="page-hero__actions reveal">
            <a className="btn btn--primary" href="./index.html#booking">
              Записаться
            </a>
            <a className="btn btn--ghost" href="./index.html">
              На главную
            </a>
          </div>
        </section>

        {PROCEDURES.map((item, index) => (
          <section className="procedure-detail" id={item.id} key={item.id}>
            <div className="procedure-detail__num reveal">{String(index + 1).padStart(2, "0")}</div>
            <div className="procedure-detail__body">
              <div className="procedure-detail__title-row reveal">
                <h2>{item.title}</h2>
                <p className="procedure-detail__price">{item.price}</p>
              </div>
              <p className="reveal">{item.description}</p>
              <ul className="procedure-detail__list reveal">
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}

        <section className="page-cta">
          <div className="page-cta__inner reveal">
            <h2 className="section-title">Готовы подобрать процедуру?</h2>
            <p>Напишите или позвоните — подберём протокол под вашу кожу и задачи.</p>
            <div className="page-cta__actions">
              <a className="btn btn--primary" href="./index.html#booking">
                Связаться
              </a>
              <a className="btn btn--ghost" href="./index.html#shop">
                Перейти в магазин
              </a>
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
