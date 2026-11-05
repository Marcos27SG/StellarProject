import type { CategoryDef } from "./types";

export const dairyMilk: CategoryDef = {
  id: "dairy.milk",
  group: "alimentos",
  label: "Leche fresca",
  icon: "Milk",
  accent: "milk",
  unit: { singular: "litro", plural: "litros", short: "L", step: 1, maxPerOrder: 60 },
  deliveryMode: "recurring_pickup",
  perishable: true,
  attributes: [
    {
      key: "tipo",
      label: "Tipo",
      type: "select",
      options: [
        { value: "entera", label: "Entera" },
        { value: "descremada", label: "Descremada" },
      ],
      required: true,
      showOnCard: true,
    },
    { key: "origen", label: "Origen", type: "text", placeholder: "Punata, Cochabamba", showOnCard: true },
    { key: "punto_recojo", label: "Punto de recojo", type: "text", placeholder: "Feria de la plaza, sábados 7–11" },
  ],
  milestoneTemplates: [
    {
      title: "Compra de alimento para el ganado",
      suggestedPct: 20,
      evidenceHint: "Factura del alimento y foto de la entrega en el establo.",
    },
  ],
  verifierLabel: "Asociación de productores lecheros",
  defaults: { saleDays: 7, deliveryDays: 30, minUnits: 50, maxUnits: 300, unitPrice: "0.60" },
  priceDisplay: { decimals: 2 },
  copy: {
    tagline: "La leche de mañana, al precio de hoy.",
    deliveryVerb: "entregar",
    confirmVerb: "confirmar que recibí la leche",
    producerNoun: "lechero",
  },
};
