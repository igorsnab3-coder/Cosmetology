export default {
  name: "get_procedures",
  description:
    "Список процедур кабинета: описание, для каких задач подходит, цена если известна, ссылка на страницу. Вызывайте, когда клиент спрашивает про уход, кожу или конкретную процедуру.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Необязательный id процедуры: mesotherapy, biorevitalization, cleaning, microcurrent, noninvasive, care"
      }
    }
  },
  async execute({ id } = {}, ctx) {
    const clinic = ctx.readClinic();
    const procedures = Array.isArray(clinic.procedures) ? clinic.procedures : [];
    const needle = String(id || "").trim().toLowerCase();
    const items = needle
      ? procedures.filter((item) => String(item.id || "").toLowerCase() === needle)
      : procedures;
    return {
      listUrl: clinic.links?.procedures || "./procedures.html",
      items
    };
  }
};
