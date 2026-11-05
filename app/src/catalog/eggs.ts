import type { CategoryDef } from "./types";

export const eggs: CategoryDef = {
  id: "eggs",
  group: "alimentos",
  label: "Huevos de granja",
  icon: "Egg",
  accent: "eggs",
  unit: { singular: "docena", plural: "docenas", short: "doc.", step: 1, maxPerOrder: 30 },
  deliveryMode: "pickup",
  perishable: true,
  attributes: [
    {
      key: "crianza",
      label: "Crianza",
      type: "select",
      options: [
        { value: "libre", label: "Gallinas libres" },
        { value: "galpon", label: "Galpón" },
      ],
      showOnCard: true,
    },
    {
      key: "tamano",
      label: "Tamaño",
      type: "select",
      options: [
        { value: "mediano", label: "Mediano" },
        { value: "grande", label: "Grande" },
        { value: "extra", label: "Extra grande" },
      ],
      showOnCard: true,
    },
    { key: "origen", label: "Granja", type: "text", placeholder: "Warnes, Santa Cruz" },
  ],
  milestoneTemplates: [
    {
      title: "Compra de alimento balanceado",
      suggestedPct: 15,
      evidenceHint: "Factura del alimento balanceado.",
    },
  ],
  verifierLabel: "Asociación de avicultores",
  defaults: { saleDays: 7, deliveryDays: 21, minUnits: 40, maxUnits: 200, unitPrice: "2.50" },
  priceDisplay: { decimals: 2 },
  copy: { tagline: "Los huevos de mañana, al precio de hoy.", producerNoun: "granja" },
};
