import { Package } from "lucide-react";
import type { CategoryDef } from "@/catalog";
import { CATEGORY_ICONS } from "@/catalog/icons";

/** Lucide icon by name, an emoji, or the generic package icon. Decorative unless `label` is given. */
export function CategoryIcon({
  category,
  className = "size-5",
  label,
}: {
  category: CategoryDef;
  className?: string;
  label?: string;
}) {
  const Icon = CATEGORY_ICONS[category.icon];
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  if (Icon) return <Icon className={className} {...a11y} />;
  if (category.icon && !/^[A-Za-z0-9]+$/.test(category.icon)) {
    return (
      <span className={`inline-flex items-center justify-center leading-none ${className}`} {...a11y}>
        {category.icon}
      </span>
    );
  }
  return <Package className={className} {...a11y} />;
}

/**
 * The category icon on a neutral tile. Categories are told apart by icon and name, not by color,
 * which keeps the palette to one primary and one accent.
 */
export function CategoryTile({ category, size = "md" }: { category: CategoryDef; size?: "md" | "lg" }) {
  const s = size === "lg" ? "size-14 [&>*]:size-7" : "size-11 [&>*]:size-6";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2 ${s}`}>
      <CategoryIcon category={category} />
    </span>
  );
}
