import { useEffect, useRef } from "react";

const REVIEWS = [
  { author: "Анна К.", text: "«Очень бережный подход и красивый результат. После чистки кожа ровная и спокойная — без раздражения.»" },
  { author: "Мария Л.", text: "«Делала биоревитализацию у Яны Сергеевны. Всё объяснила подробно, процедура комфортная, лицо свежее и увлажнённое.»" },
  { author: "Елена В.", text: "«Хожу на микротоки и уходовые процедуры. Замечаю, что тон лица выровнялся, а кожа стала более упругой.»" },
  { author: "Ольга С.", text: "«Деликатно, профессионально и спокойно. После мезотерапии кожа заметно более плотная и сияющая.»" },
  { author: "Ирина М.", text: "«Приятная атмосфера и внимательное отношение. После уходовой процедуры лицо отдохнувшее, как после короткого отпуска.»" },
  { author: "Дарья П.", text: "«Неинвазивная мезотерапия прошла комфортно. Результат мягкий и естественный — именно то, что хотела.»" }
];

export default function Reviews() {
  const trackRef = useRef(null);

  const scrollByCard = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector(".review");
    let step = 320;
    if (card) {
      const styles = window.getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
      step = card.getBoundingClientRect().width + gap;
    }
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let moved = false;

    const onDown = (event) => {
      isDown = true;
      moved = false;
      startX = event.clientX;
      scrollLeft = track.scrollLeft;
      track.classList.add("is-dragging");
      track.setPointerCapture(event.pointerId);
    };
    const onMove = (event) => {
      if (!isDown) return;
      const walk = event.clientX - startX;
      if (Math.abs(walk) > 4) moved = true;
      track.scrollLeft = scrollLeft - walk;
    };
    const onUp = (event) => {
      if (!isDown) return;
      isDown = false;
      track.classList.remove("is-dragging");
      if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    };
    const onLeave = () => {
      if (!isDown) return;
      isDown = false;
      track.classList.remove("is-dragging");
    };
    const onClick = (event) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onWheel = (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        track.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    };

    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
    track.addEventListener("pointerleave", onLeave);
    track.addEventListener("click", onClick, true);
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      track.removeEventListener("pointerdown", onDown);
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
      track.removeEventListener("pointerleave", onLeave);
      track.removeEventListener("click", onClick, true);
      track.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <section className="reviews" id="reviews">
      <div className="reviews__head">
        <div>
          <p className="eyebrow reveal">Отзывы</p>
          <h2 className="section-title reveal">Что говорят пациенты</h2>
          <p className="reviews__intro reveal">Листайте ленту влево-вправо — мышкой, пальцем или колёсиком.</p>
        </div>
        <div className="reviews__controls reveal">
          <button className="reviews__arrow" type="button" aria-label="Предыдущий отзыв" onClick={() => scrollByCard(-1)}>
            ←
          </button>
          <button className="reviews__arrow" type="button" aria-label="Следующий отзыв" onClick={() => scrollByCard(1)}>
            →
          </button>
        </div>
      </div>

      <div className="reviews__viewport reveal">
        <div className="reviews__track" ref={trackRef}>
          {REVIEWS.map((review) => (
            <figure className="review" key={review.author}>
              <blockquote>{review.text}</blockquote>
              <figcaption>{review.author}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
