import type { CategoryDef } from "./types";

export const vegBasket: CategoryDef = {
  id: "veg_basket",
  group: "alimentos",
  label: "Canasta de verduras",
  icon: "ShoppingBasket",
  accent: "veg",
  unit: { singular: "canasta", plural: "canastas", step: 1, maxPerOrder: 12 },
  deliveryMode: "recurring_pickup",
  perishable: true,
  attributes: [
    {
      key: "contenido",
      label: "Contenido",
      type: "text",
      placeholder: "Papa 2 kg, tomate 1 kg, cebolla 1 kg, lechuga, zanahoria",
      required: true,
    },
    { key: "peso_kg", label: "Peso aproximado", type: "number", unit: "kg", showOnCard: true },
    { key: "organico", label: "Sin agroquímicos", type: "boolean", showOnCard: true },
    {
      key: "frecuencia",
      label: "Frecuencia",
      type: "select",
      options: [
        { value: "semanal", label: "Semanal" },
        { value: "quincenal", label: "Quincenal" },
      ],
      showOnCard: true,
    },
  ],
  milestoneTemplates: [
    {
      title: "Compra de semillas y abono",
      suggestedPct: 20,
      evidenceHint: "Factura de semillas y foto de la parcela sembrada.",
    },
  ],
  verifierLabel: "Asociación de productores ecológicos",
  defaults: { saleDays: 10, deliveryDays: 60, minUnits: 20, maxUnits: 120, unitPrice: "8.00" },
  priceDisplay: { decimals: 2 },
  copy: { tagline: "La cosecha de mañana, al precio de hoy.", producerNoun: "huerta" },
};
