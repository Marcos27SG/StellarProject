import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { CategoryDef } from "@/catalog";
import { CATEGORY_ICONS } from "@/catalog/icons";
import { ApartmentIcon, BasketIcon, CoffeeIcon, CrateIcon, EggIcon, MilkIcon } from "./icons";

type AnyIcon = LucideIcon | ComponentType<{ className?: string }>;

// Board 06 draws Ayni's own category icons. The catalog still names lucide icons (catalog/icons.ts is
// part of the category registry and stays as it is); those names are mapped here to the board's shapes.
// A name with no board icon falls back to the catalog's lucide icon, then to an emoji, then a crate.
const AYNI_ICONS: Record<string, AnyIcon> = {
  Milk: MilkIcon,
  Egg: EggIcon,
  ShoppingBasket: BasketIcon,
  Coffee: CoffeeIcon,
  Building2: ApartmentIcon,
  Package: CrateIcon,
};

/** The category's icon. Decorative unless `label` is given. */
export function CategoryIcon({
  category,
  className = "size-5",
  label,
}: {
  category: CategoryDef;
  className?: string;
  label?: string;
}) {
  const Icon: AnyIcon | undefined = AYNI_ICONS[category.icon] ?? CATEGORY_ICONS[category.icon];
  const a11y = label ? { role: "img", "aria-label": label, "aria-hidden": false } : { "aria-hidden": true };
  if (Icon) return <Icon className={className} {...a11y} />;
  if (category.icon && !/^[A-Za-z0-9]+$/.test(category.icon)) {
    return (
      <span className={`inline-flex items-center justify-center leading-none ${className}`} {...a11y}>
        {category.icon}
      </span>
    );
  }
  return <CrateIcon className={className} {...a11y} />;
}

/**
 * The category icon on a neutral tile (board 04): 48 px in lists and vouchers, 76 px on campaign
 * cards. The tile is neutral, not the green tint, which is reserved for "your money is here".
 * Categories are told apart by icon and name, not by color.
 */
export function CategoryTile({ category, size = "md" }: { category: CategoryDef; size?: "md" | "lg" }) {
  const s = size === "lg" ? "size-[76px] [&>*]:size-[34px]" : "size-12 [&>*]:size-[26px]";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md bg-surface-2 text-brand ${s}`}>
      <CategoryIcon category={category} />
    </span>
  );
}
