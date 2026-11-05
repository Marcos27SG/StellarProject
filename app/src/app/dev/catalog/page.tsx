import { notFound } from "next/navigation";
import CatalogPreview from "./CatalogPreview";

export const metadata = { title: "Catálogo (dev)" };

/** Dev-only: renders every category from catalog/ with sample data. Proves new categories need no component changes. */
export default function DevCatalogPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CatalogPreview />;
}
