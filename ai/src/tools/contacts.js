export default {
  name: "get_contacts",
  description:
    "Контакты кабинета: адрес, карта, телефон, WhatsApp, Telegram, почта, образование специалиста.",
  parameters: {
    type: "object",
    properties: {}
  },
  async execute(_args, ctx) {
    const clinic = ctx.readClinic();
    return {
      specialist: clinic.specialist,
      role: clinic.role,
      city: clinic.city,
      education: clinic.education,
      contacts: clinic.contacts || {},
      contactUrl: clinic.links?.contact || "./index.html#contact"
    };
  }
};
