import { useEffect, useState } from "react";
import { ready, SHOP_EVENTS } from "./shop.js";

/** Перерисовывает компонент при любом изменении каталога, корзины, валюты или заказов. */
export function useShopVersion() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const bump = () => {
      if (alive) setVersion((value) => value + 1);
    };
    SHOP_EVENTS.forEach((name) => window.addEventListener(name, bump));
    ready.finally(bump);
    return () => {
      alive = false;
      SHOP_EVENTS.forEach((name) => window.removeEventListener(name, bump));
    };
  }, []);

  return version;
}

/** Плавное появление элементов `.reveal`, которые ещё не наблюдаются. */
export function useReveal(deps = []) {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll(".reveal:not([data-reveal-bound])"));
    if (!items.length) return undefined;

    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
    );

    items.forEach((item, index) => {
      item.dataset.revealBound = "1";
      item.style.transitionDelay = `${Math.min(index % 7, 5) * 80}ms`;
      observer.observe(item);
    });

    return () => {
      observer.disconnect();
      items.forEach((item) => {
        if (!item.classList.contains("is-visible")) delete item.dataset.revealBound;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useBodyClass(className, active) {
  useEffect(() => {
    document.body.classList.toggle(className, Boolean(active));
    return () => document.body.classList.remove(className);
  }, [className, active]);
}

export function useEscape(handler, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") handler();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handler, active]);
}
