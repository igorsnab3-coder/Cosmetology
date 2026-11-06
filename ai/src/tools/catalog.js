export default {
  name: "get_catalog",
  description:
    "Актуальный каталог магазина кабинета: товары и услуги с ценами в рублях. Вызывайте перед ответом про цену, наличие или состав магазина.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Необязательный поиск по названию или описанию"
      }
    }
  },
  async execute({ query } = {}, ctx) {
    const items = ctx.readProducts(query).map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      description: item.description,
      price: item.price,
      priceLabel: `${item.price} ₽`
    }));
    return {
      shopUrl: "./index.html#shop",
      currency: "RUB",
      items
    };
  }
};
