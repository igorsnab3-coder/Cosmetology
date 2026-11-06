export default {
  name: "get_booking_info",
  description:
    "Как записаться: способы связи, слоты времени, доступные процедуры для записи. Не создаёт заявку — только подсказывает, куда написать или какую форму открыть.",
  parameters: {
    type: "object",
    properties: {}
  },
  async execute(_args, ctx) {
    const clinic = ctx.readClinic();
    return {
      methods: clinic.booking?.methods || [],
      timeSlots: clinic.booking?.timeSlots || [],
      options: clinic.booking?.options || [],
      contacts: clinic.contacts || {},
      bookingUrl: clinic.links?.contact || "./index.html#contact",
      note: "Запись подтверждается очно или через контакты кабинета. Джарвис сам заявку не создаёт."
    };
  }
};
