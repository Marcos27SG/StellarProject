import type { CategoryDef } from "./types";

/** Roadmap demo: same contract, construction milestones, an engineer as verifier. */
export const realEstateApartment: CategoryDef = {
  id: "real_estate.apartment",
  group: "inmuebles",
  label: "Departamento en preventa",
  icon: "Building2",
  accent: "realestate",
  unit: { singular: "departamento", plural: "departamentos", short: "dpto.", step: 1, maxPerOrder: 2 },
  deliveryMode: "handover",
  perishable: false,
  attributes: [
    { key: "superficie", label: "Superficie", type: "number", unit: "m²", required: true, showOnCard: true },
    { key: "dormitorios", label: "Dormitorios", type: "number", required: true, showOnCard: true },
    { key: "piso", label: "Piso", type: "number" },
    { key: "zona", label: "Zona", type: "text", placeholder: "Equipetrol, Santa Cruz", showOnCard: true },
    { key: "permiso_construccion", label: "Permiso de construcción", type: "url" },
    { key: "planos", label: "Planos aprobados", type: "url" },
  ],
  milestoneTemplates: [
    { title: "Excavación", suggestedPct: 5, evidenceHint: "Informe del ingeniero y fotos del terreno excavado." },
    { title: "Fundaciones vaciadas", suggestedPct: 10, evidenceHint: "Acta de vaciado y ensayo de resistencia del hormigón." },
    { title: "Obra gruesa", suggestedPct: 15, evidenceHint: "Informe de avance con fotos por piso." },
    { title: "Instalaciones", suggestedPct: 10, evidenceHint: "Certificados de instalaciones eléctricas, agua y gas." },
    { title: "Acabados", suggestedPct: 10, evidenceHint: "Informe final del ingeniero y acta de inspección." },
  ],
  verifierLabel: "Ingeniero certificado",
  defaults: { saleDays: 90, deliveryDays: 730, minUnits: 10, maxUnits: 20, unitPrice: "60000" },
  priceDisplay: { decimals: 0 },
  copy: {
    tagline: "Tu departamento de mañana, al precio de hoy. Sin riesgo de estafa.",
    deliveryVerb: "entregar llaves",
    confirmVerb: "confirmar que recibí las llaves",
    voucherNoun: "reserva",
    producerNoun: "constructora",
    productionStage: "Obra y entrega de llaves",
  },
  comingSoon: true,
};
