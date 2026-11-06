import * as shop from "../../lib/shop.js";
import { MAPS_URL } from "../../lib/site.js";

const PROCEDURES = [
  {
    id: "mesotherapy",
    title: "Мезотерапия",
    summary:
      "Точечное введение активных компонентов в поверхностные слои кожи. Улучшает качество, тонус, цвет и увлажнённость.",
    suits: "тусклость, обезвоженность, признаки усталости кожи"
  },
  {
    id: "biorevitalization",
    title: "Биоревитализация",
    summary:
      "Глубокое увлажнение препаратами на основе гиалуроновой кислоты. Стимулирует обновление и возвращает коже свежий, напитанный вид.",
    suits: "сухость, потеря эластичности, мелкие морщины"
  },
  {
    id: "cleaning",
    title: "Медицинская и уходовая чистка лица",
    summary: "Бережное очищение пор, выравнивание рельефа и подготовка кожи к дальнейшему уходу.",
    suits: "комедоны, неровный тон, загрязнения пор"
  },
  {
    id: "microcurrent",
    title: "Микротоковая терапия",
    summary:
      "Мягкая аппаратная стимуляция мышц и тканей. Комфортно, без реабилитации — на тонус, дренаж и свежий вид.",
    suits: "отёчность, усталое лицо, снижение тонуса"
  },
  {
    id: "noninvasive",
    title: "Неинвазивная мезотерапия лица",
    summary: "Безинъекционное введение сывороток. Заметный уход без уколов и длительного восстановления.",
    suits: "желание ухода без игл, регулярная поддержка кожи"
  },
  {
    id: "care",
    title: "Уходовые процедуры по восстановлению кожи",
    summary:
      "Индивидуальные протоколы для питания, успокоения и сияния. Состав зависит от состояния кожи в день визита.",
    suits: "чувствительность, тусклость, стресс для кожи"
  }
];

const CONTACTS = {
  specialist: "Яна Сергеевна Землина",
  role: "косметолог-эстетист",
  address: "Бульвар Клары Лучко, 8, этаж 2, Краснодар",
  maps: MAPS_URL,
  phone: "8-928-448-24-25",
  tel: "tel:+79284482425",
  whatsapp: "https://wa.me/79284482425",
  telegram: "https://t.me/yana_ivi",
  telegramUser: "@yana_ivi",
  email: "vdpo10@yandex.ru",
  mailto: "mailto:vdpo10@yandex.ru"
};

export const WELCOME =
  "Здравствуйте. Я **Джарвис**, онлайн-консультант кабинета Яны Сергеевны Землиной.\n\n" +
  "Подскажу процедуру под вашу задачу, расскажу об уходе, магазине и записи. Чем могу помочь?";

const DISCLAIMER =
  "Точный протокол Яна Сергеевна подберёт на очной консультации — по состоянию кожи в день визита.";

const onProceduresPage = () => /procedures\.html$/i.test(location.pathname);

export const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s+/.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasAny = (text, words) => words.some((word) => text.includes(word));

const hasWord = (text, words) => {
  const padded = ` ${text} `;
  return words.some((word) => padded.includes(` ${word} `));
};

const procedureHref = (item) => (onProceduresPage() ? `#${item.id}` : `./procedures.html#${item.id}`);
const shopPath = () => (onProceduresPage() ? "./index.html#shop" : "#shop");
const contactPath = () => (onProceduresPage() ? "./index.html#contact" : "#contact");

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const isSafeHref = (href) => {
  const value = String(href || "").trim();
  if (!value) return false;
  // Block protocol-relative URLs like //evil.com which match a leading "/".
  if (value.startsWith("//")) return false;
  return /^(#|\/(?!\/)|\.\/|\.\.\/)/.test(value) || /^(https?:|tel:|mailto:)/i.test(value);
};

/** Мини-разметка ответов: **жирный** и [ссылка](url). Результат безопасен для innerHTML. */
export const renderRich = (text) => {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const rawHref = String(href || "").trim();
    if (!isSafeHref(rawHref)) return label;
    const external = /^(https?:|tel:|mailto:)/i.test(rawHref);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escapeHtml(rawHref)}"${attrs}>${label}</a>`;
  });
  return html
    .split("\n")
    .map((line) => `<p>${line || "&nbsp;"}</p>`)
    .join("");
};

const bookingBlock = () =>
  `Записаться удобнее так:\n` +
  `• телефон: [${CONTACTS.phone}](${CONTACTS.tel})\n` +
  `• WhatsApp: [написать](${CONTACTS.whatsapp})\n` +
  `• Telegram: [${CONTACTS.telegramUser}](${CONTACTS.telegram})\n` +
  `• почта: [${CONTACTS.email}](${CONTACTS.mailto})\n\n` +
  `Кабинет: [${CONTACTS.address}](${CONTACTS.maps}).`;

const listProcedures = () =>
  PROCEDURES.map(
    (item, index) =>
      `${String(index + 1).padStart(2, "0")}. **[${item.title}](${procedureHref(item)})** — ${item.summary}`
  ).join("\n\n");

const CONCERN_RULES = [
  { id: "dry", words: ["сухо", "обезвож", "стянут", "шелуш", "гиалурон", "увлажн"], procedure: "biorevitalization" },
  { id: "acne", words: ["прыщ", "акне", "воспален", "комедон", "черн точ", "поры", "загряз", "чистка"], procedure: "cleaning" },
  { id: "dull", words: ["тускл", "серый", "сияни", "устала кожа", "нет цвета", "цвет лица"], procedure: "mesotherapy" },
  { id: "edema", words: ["отек", "отечн", "пастоз", "усталое лицо", "опущен", "овал", "тонус"], procedure: "microcurrent" },
  { id: "wrinkle", words: ["морщин", "эластичн", "упруг", "возраст", "мелкоморщ"], procedure: "biorevitalization" },
  { id: "sensitive", words: ["чувствит", "покрасн", "раздраж", "купероз", "жжет", "печет", "реактивн"], procedure: "care" },
  { id: "needles", words: ["без укол", "без игл", "боюсь укол", "неинвазив", "без иглы", "без инъек"], procedure: "noninvasive" }
];

const PROCEDURE_KEYWORDS = [
  { id: "mesotherapy", words: ["мезотерап", "мезо "] },
  { id: "biorevitalization", words: ["биоревитал", "биорев"] },
  { id: "cleaning", words: ["чистк", "комедон"] },
  { id: "microcurrent", words: ["микроток", "микро ток"] },
  { id: "noninvasive", words: ["неинвазив", "без укол", "безынъек", "безинъек"] },
  { id: "care", words: ["уходов", "восстановлен кожи"] }
];

export const findConcern = (text) => CONCERN_RULES.find((rule) => hasAny(text, rule.words)) || null;

const findProcedure = (text) => {
  const hit = PROCEDURE_KEYWORDS.find((item) => hasAny(text, item.words));
  return hit ? PROCEDURES.find((item) => item.id === hit.id) : null;
};

const catalogAnswer = (text) => {
  const items = shop.getProducts();
  const query = text.replace(/товар|магазин|купить|средство|уход дома|домашний уход|цена|сколько стоит/g, "").trim();
  const matched =
    query.length > 2 ? items.filter((item) => normalize(`${item.name} ${item.description || ""}`).includes(query)) : items;

  const lines = (matched.length ? matched : items).slice(0, 6).map((item) => {
    const typeLabel = item.type === "service" ? "услуга" : "товар";
    return `• **${item.name}** (${typeLabel}) — ${shop.formatPrice(item.price)}. ${item.description || ""}`.trim();
  });

  return (
    `В магазине сейчас можно выбрать:\n\n${lines.join("\n")}\n\n` +
    `Открыть витрину: [Магазин](${shopPath()}). Оформить заказ можно через WhatsApp или Telegram.`
  );
};

const aboutAnswer = () =>
  `**${CONTACTS.specialist}** — ${CONTACTS.role}.\n\n` +
  `Окончила Кубанский институт профессионального образования по специальности «Сестринское дело», ` +
  `прошла повышение квалификации «Сестринское дело в косметологии».\n\n` +
  `В работе сочетает медицинский подход и эстетическую деликатность: процедуры подбираются под состояние кожи и ваши задачи.`;

export function createBrain() {
  let lastIntent = null;

  const recommendForConcern = (concern) => {
    const procedure = PROCEDURES.find((item) => item.id === concern.procedure);
    if (!procedure) return listProcedures();
    return (
      `По вашему запросу я бы начал с процедуры **[${procedure.title}](${procedureHref(procedure)})**.\n\n` +
      `${procedure.summary}\nХорошо подходит при: ${procedure.suits}.\n\n` +
      `${DISCLAIMER}\n\nЕсли хотите, помогу [записаться](${contactPath()}).`
    );
  };

  const classify = (text) => {
    const scores = {
      greeting: hasAny(text, ["привет", "здравствуй", "добрый день", "добрый вечер", "доброе утро", "hello", "хай", "здорово"]) ? 3 : 0,
      thanks: hasAny(text, ["спасибо", "благодар", "отлично", "супер"]) ? 3 : 0,
      booking: hasAny(text, ["запис", "прием", "приём", "консультац", "whatsapp", "ватсап", "телеграм", "telegram", "позвон", "телефон", "номер"]) ? 4 : 0,
      address: hasAny(text, ["адрес", "где находит", "как проехать", "карта", "кабинет", "где вы", "локац", "клары лучко"]) ? 4 : 0,
      about: hasAny(text, ["о специалист", "кто такая", "образование", "яна", "землин", "о вас", "обо мне"]) ? 3 : 0,
      shop: hasAny(text, ["магазин", "товар", "купить", "сыворот", "крем", "маска", "тоник", "spf", "набор", "цена", "сколько стоит", "прайс"]) ? 4 : 0,
      procedures: hasAny(text, ["процедур", "услуг", "что делаете", "какие есть", "специализац", "методик"]) ? 4 : 0,
      pick: hasAny(text, ["подбер", "подобер", "посовет", "что лучше", "что выбрать", "рекоменд", "мне нужно", "хочу"]) ? 3 : 0,
      confirm: hasWord(text, ["да", "давайте", "хорошо", "ок", "окей", "конечно", "ага"]) ? 2 : 0
    };

    const procedure = findProcedure(text);
    const concern = findConcern(text);
    if (procedure) scores.procedureDetail = 6;
    if (concern) scores.concern = 5;

    let intent = "fallback";
    let best = 1;
    Object.entries(scores).forEach(([key, value]) => {
      if (value > best) {
        best = value;
        intent = key;
      }
    });

    return { intent, procedure, concern };
  };

  const thinkText = (raw) => {
    const text = normalize(raw);
    if (!text) return "Напишите вопрос — например, о сухости кожи, чистке или записи.";

    const { intent, procedure, concern } = classify(text);

    if (intent === "confirm" && ["booking", "pick", "concern"].includes(lastIntent)) {
      lastIntent = "booking";
      return `Разумеется.\n\n${bookingBlock()}`;
    }

    lastIntent = intent;

    switch (intent) {
      case "greeting":
        return WELCOME;
      case "thanks":
        return "Всегда рад помочь. Если появятся ещё вопросы по коже, процедурам или записи — я на связи.";
      case "address":
        return `Кабинет находится по адресу **[${CONTACTS.address}](${CONTACTS.maps})**.\n\n${bookingBlock()}`;
      case "booking":
        return (
          `С удовольствием сориентирую по записи.\n\n${bookingBlock()}\n\n` +
          `Если коротко опишете задачу кожи, подскажу, к какой процедуре лучше готовиться.`
        );
      case "about":
        return aboutAnswer();
      case "shop":
        return catalogAnswer(text);
      case "procedureDetail":
        return (
          `**[${procedure.title}](${procedureHref(procedure)})**\n\n${procedure.summary}\n` +
          `Подходит при: ${procedure.suits}.\n\n${DISCLAIMER}`
        );
      case "concern":
        return recommendForConcern(concern);
      case "procedures":
      case "pick":
        if (concern) return recommendForConcern(concern);
        return (
          `Конечно. В кабинете работают такие направления:\n\n${listProcedures()}\n\n` +
          `Опишите, что беспокоит кожу — подберу более точное направление. ${DISCLAIMER}`
        );
      default:
        lastIntent = "fallback";
        return (
          "Я консультант кабинета и могу помочь с процедурами, домашним уходом и записью.\n\n" +
          "Например: сухость, тусклый тон, чистка, микротоки или товары из магазина. Что сейчас актуально?"
        );
    }
  };

  return { thinkText, recommendForConcern };
}
