import type { Metadata } from "next";
import { getCategory } from "@/catalog";
import { getCampaign } from "@/lib/despensa";
import { decimalsFor, formatMoney, safeHref } from "@/lib/format";
import { resolveCampaignMetadata } from "@/lib/metadata";
import CampaignView from "./CampaignView";

/** Never let a slow RPC hold up the page: link previews fall back to the generic text. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/**
 * Title and description for the browser tab and for link previews (WhatsApp, Telegram, Facebook),
 * read from the contract on the server.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const fallback: Metadata = { title: "Preventa" };
  if (!/^\d+$/.test(id)) return fallback;
  try {
    const c = await withTimeout(getCampaign(BigInt(id)), 4000);
    const { meta } = await withTimeout(resolveCampaignMetadata(c), 2000);
    const category = getCategory(meta.category);
    const price = formatMoney(c.unit_price, decimalsFor(category));
    const description = [
      `${price} por ${category.unit.singular}, precio bloqueado.`,
      "Tu pago queda protegido en Stellar hasta que recibes tu pedido; si no se cumple, se te devuelve.",
      meta.description,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 220);
    const image = safeHref(meta.images[0]);
    return {
      title: c.title,
      description,
      openGraph: {
        title: c.title,
        description,
        siteName: "Pacta",
        type: "website",
        locale: "es_BO",
        // A route's openGraph replaces the parent's, so fall back to the site card explicitly.
        images: [image ? { url: image } : { url: "/opengraph-image.png", width: 1200, height: 630, alt: "Pacta" }],
      },
      twitter: { card: "summary_large_image", title: c.title, description, images: [image ?? "/opengraph-image.png"] },
    };
  } catch {
    return fallback;
  }
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignView id={id} />;
}
