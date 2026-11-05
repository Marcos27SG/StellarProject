import type { CategoryDef, CopyKey } from "./types";

/** Fallback for unknown or missing categories (older campaigns, other clients). */
export const generic: CategoryDef = {
  id: "generic",
  group: "otros",
  label: "Producto local",
  icon: "Package",
  accent: "generic",
  unit: { singular: "unidad", plural: "unidades", short: "u.", step: 1 },
  deliveryMode: "pickup",
  perishable: false,
  attributes: [],
  milestoneTemplates: [
    {
      title: "Compra de insumos",
      suggestedPct: 20,
      evidenceHint: "Factura o foto de los insumos comprados.",
    },
  ],
  verifierLabel: "Verificador independiente",
  defaults: { saleDays: 7, deliveryDays: 30, minUnits: 10, maxUnits: 100, unitPrice: "1.00" },
  priceDisplay: { decimals: 2 },
};

/** Default copy, overridden per category through CategoryDef.copy. */
export const DEFAULT_COPY: Record<CopyKey, string> = {
  tagline: "Lo de mañana, al precio de hoy.",
  deliveryVerb: "entregar",
  confirmVerb: "confirmar que recibí",
  voucherNoun: "vale",
  producerNoun: "productor",
  productionStage: "Producción y entrega",
};
