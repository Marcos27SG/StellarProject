// Category registry. Adding a category = one file in catalog/ + one line in CATEGORIES.

import { dairyMilk } from "./dairy.milk";
import { eggs } from "./eggs";
import { DEFAULT_COPY, generic } from "./generic";
import { realEstateApartment } from "./real_estate.apartment";
import type { CategoryDef, CopyKey } from "./types";
import { vegBasket } from "./veg_basket";

export * from "./types";
export { generic };

/** Order here is the order of the marketplace chips. */
export const CATEGORIES: readonly CategoryDef[] = [
  dairyMilk,
  eggs,
  vegBasket,
  realEstateApartment,
];

const BY_ID = new Map<string, CategoryDef>([...CATEGORIES, generic].map((c) => [c.id, c]));

/** Always returns a category: unknown or missing ids fall back to `generic`. */
export function getCategory(id: string | null | undefined): CategoryDef {
  return (id && BY_ID.get(id)) || generic;
}

export function isKnownCategory(id: string | null | undefined): boolean {
  return !!id && BY_ID.has(id);
}

/** Categories for the marketplace chips and the create wizard. */
export function listCategories(opts: { includeComingSoon?: boolean } = {}): CategoryDef[] {
  return CATEGORIES.filter((c) => opts.includeComingSoon || !c.comingSoon);
}

/** Category-aware copy with defaults. */
export function copy(category: CategoryDef, key: CopyKey): string {
  return category.copy?.[key] ?? DEFAULT_COPY[key];
}

/** "1 litro", "3 litros". Formats the number in es-BO. */
export function unitLabel(category: CategoryDef, n: number): string {
  return n === 1 ? category.unit.singular : category.unit.plural;
}
