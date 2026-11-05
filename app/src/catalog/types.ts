// Category registry types.
// Every product-specific word, unit, attribute and milestone lives in a CategoryDef.
// Components receive a CategoryDef and never hard-code a product.

export type DeliveryMode = "pickup" | "home_delivery" | "recurring_pickup" | "handover";

export interface UnitDef {
  /** "litro", "docena", "canasta", "departamento" */
  singular: string;
  /** "litros", "docenas", "canastas", "departamentos" */
  plural: string;
  /** "L", "doc." */
  short?: string;
  /** Minimum purchase increment, e.g. 1 for most, 5 for "5 L packs". */
  step: number;
  /** UI cap per purchase (the contract caps by max_units). */
  maxPerOrder?: number;
}

export interface AttributeField {
  /** "fat_content", "breed", "floor", "bedrooms" */
  key: string;
  /** Spanish label */
  label: string;
  type: "text" | "number" | "select" | "boolean" | "date" | "url";
  options?: { value: string; label: string }[];
  /** "%", "m²" */
  unit?: string;
  required?: boolean;
  /** Surfaces as a chip on the marketplace card. */
  showOnCard?: boolean;
  /** Placeholder / example shown in the create wizard. */
  placeholder?: string;
}

export interface MilestoneTemplate {
  /** "Compra de alimento para el ganado", "Fundaciones vaciadas" */
  title: string;
  /** Share of the price in percent (20 = 20%). The UI clamps the total to the producer's tier limit. */
  suggestedPct: number;
  /** What proof the verifier expects. */
  evidenceHint: string;
}

export type CategoryGroup = "alimentos" | "bebidas" | "artesania" | "inmuebles" | "otros";

/** Copy keys a category may override. Defaults live in catalog/generic.ts. */
export type CopyKey = "tagline" | "deliveryVerb" | "confirmVerb" | "voucherNoun" | "producerNoun" | "productionStage";

export interface CategoryDef {
  /** "dairy.milk", "eggs", "veg_basket", "real_estate.apartment" */
  id: string;
  group: CategoryGroup;
  /** "Leche fresca" */
  label: string;
  /** Lucide icon name (PascalCase, e.g. "Milk") or an emoji. Rendered by <CategoryIcon/>. */
  icon: string;
  /** Design-token name, not a hex value. Maps to --color-cat-<accent> in globals.css. */
  accent: string;
  unit: UnitDef;
  deliveryMode: DeliveryMode;
  perishable: boolean;
  attributes: AttributeField[];
  /** Max 5 (contract limit). */
  milestoneTemplates: MilestoneTemplate[];
  /** "Asociación de productores", "Ingeniero certificado" */
  verifierLabel: string;
  /** Pre-fill the create wizard. */
  defaults: {
    saleDays: number;
    deliveryDays: number;
    minUnits: number;
    maxUnits: number;
    /** Suggested price per unit in USD, as a decimal string ("0.60"). */
    unitPrice?: string;
  };
  /** 2 for food; 0 for a US$60,000 apartment. */
  priceDisplay: { decimals: 0 | 2 };
  copy?: Partial<Record<CopyKey, string>>;
  /** Roadmap category: visible in the catalog with a "Próximamente" flag, hidden from the create wizard. */
  comingSoon?: boolean;
}

/** Contract limit on milestones per campaign. */
export const MAX_MILESTONES = 5;
