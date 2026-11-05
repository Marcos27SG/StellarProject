// Icons referenced by CategoryDef.icon. Kept in catalog/ so a category that needs a new icon only
// touches this folder. Not re-exported from catalog/index.ts, so pure modules (actions, metadata)
// don't pull React in. Unknown names render as text (emoji) or the generic Package icon.

import { Building2, Coffee, Egg, Milk, Package, ShoppingBasket, type LucideIcon } from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Building2,
  Coffee,
  Egg,
  Milk,
  Package,
  ShoppingBasket,
};
