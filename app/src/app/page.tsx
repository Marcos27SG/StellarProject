"use client";

import { ChevronDown, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { copy, generic, getCategory, listCategories, type CategoryDef } from "@/catalog";
import { CampaignCard } from "@/components/CampaignCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { AffixInput, CampaignCardSkeleton, EmptyState, Notice } from "@/components/ui";
import { avgRating, type StatusTag } from "@/lib/despensa";
import { useCampaignList, useNow, useProducers, type CampaignItem, type ProducerStats } from "@/lib/hooks";

type StatusFilter = "live" | "Funding" | "Active" | "closed" | "all";
type Sort = "featured" | "closing" | "funded" | "reputation";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "live", label: "Abiertas y en entrega" },
  { id: "Funding", label: "En preventa" },
  { id: "Active", label: "En entrega" },
  { id: "closed", label: "Terminadas" },
  { id: "all", label: "Todas" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "featured", label: "Destacadas" },
  { id: "closing", label: "Cierran pronto" },
  { id: "funded", label: "Más avanzadas" },
  { id: "reputation", label: "Mejor productor" },
];

const STATUS_RANK: Record<StatusTag, number> = { Funding: 0, Active: 1, Completed: 2, Failed: 3, Defaulted: 3 };
/** Below this many campaigns there is nothing to filter: the toolbar stays hidden. */
const FILTER_THRESHOLD = 6;

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const isLive = (t: StatusTag) => t === "Funding" || t === "Active";

function score(p: ProducerStats | undefined) {
  if (!p) return 0;
  return p.tier.tier * 1000 + (avgRating(p.rep) ?? 0) * 100 + p.rep.completed;
}

export default function Marketplace() {
  const list = useCampaignList();
  const now = useNow();
  const items = list.data;
  const producers = useProducers(items?.map((i) => i.c.seller) ?? []);

  const [cat, setCat] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("live");
  const [sort, setSort] = useState<Sort>("featured");
  const [query, setQuery] = useState("");

  const anyLive = !!items?.some((i) => isLive(i.c.status.tag));
  // With nothing open, show what finished instead of an empty page.
  // With nothing open, show the ended ones instead; with no campaigns at all, keep the "first one" empty state.
  const effectiveStatus: StatusFilter = status === "live" && items && items.length > 0 && !anyLive ? "all" : status;

  const categories = useMemo(() => {
    const base: CategoryDef[] = listCategories({ includeComingSoon: true });
    if (items?.some((i) => i.category.id === generic.id)) base.push(generic);
    return base;
  }, [items]);

  const shown = useMemo(() => {
    if (!items) return [];
    const q = fold(query.trim());
    const filtered = items.filter((i) => {
      if (cat !== "all" && i.category.id !== cat) return false;
      const tag = i.c.status.tag;
      if (effectiveStatus === "live" && !isLive(tag)) return false;
      if (effectiveStatus === "closed" && isLive(tag)) return false;
      if ((effectiveStatus === "Funding" || effectiveStatus === "Active") && tag !== effectiveStatus) return false;
      if (!q) return true;
      const hay = fold([i.c.title, i.meta.meta.description, i.meta.meta.producer.displayName, i.meta.meta.producer.location ?? "", i.category.label].join(" "));
      return hay.includes(q);
    });
    const by: Record<Sort, (a: CampaignItem, b: CampaignItem) => number> = {
      featured: (a, b) =>
        STATUS_RANK[a.c.status.tag] - STATUS_RANK[b.c.status.tag] ||
        (a.c.status.tag === "Funding" ? Number(a.c.sale_end - b.c.sale_end) : Number(b.c.created_at - a.c.created_at)),
      closing: (a, b) =>
        Number(a.c.status.tag !== "Funding") - Number(b.c.status.tag !== "Funding") || Number(a.c.sale_end - b.c.sale_end),
      funded: (a, b) => b.c.sold / Math.max(1, b.c.min_units) - a.c.sold / Math.max(1, a.c.min_units),
      reputation: (a, b) => score(producers.data?.[b.c.seller]) - score(producers.data?.[a.c.seller]),
    };
    return [...filtered].sort(by[sort]);
  }, [items, cat, effectiveStatus, sort, query, producers.data]);

  const selected = cat === "all" ? null : getCategory(cat);
  const tagline = selected ? copy(selected, "tagline") : copy(generic, "tagline");
  const toolbar = (items?.length ?? 0) >= FILTER_THRESHOLD;
  const fellBack = !!items && effectiveStatus !== status;

  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-3">
        <h1 className="t-display">{tagline}</h1>
        <p className="text-[1.0625rem] text-ink-2 lg:text-lg">
          Reserva por adelantado a productores locales, a precio fijo. Tu pago espera en un contrato público de Stellar y el productor cobra
          cuando recibes. Si la preventa no llega a su mínimo, recuperas el 100%.
        </p>
        <HowItWorks />
      </section>

      <section aria-labelledby="preventas" className="space-y-5">
        <div className="space-y-1">
          <h2 id="preventas" className="h-section">
            {fellBack ? "Preventas recientes" : effectiveStatus === "live" ? "Preventas abiertas" : "Preventas"}
          </h2>
          {fellBack && <p className="text-ink-2">Ahora no hay preventas abiertas. Estas ya terminaron.</p>}
        </div>

        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-1">
          <ul className="flex w-max gap-2" aria-label="Categorías">
            <Chip on={cat === "all"} onClick={() => setCat("all")} label="Todo" />
            {categories.map((c) => (
              <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)} label={c.label} category={c} soon={c.comingSoon} />
            ))}
          </ul>
        </div>

        {toolbar && (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label>
              <span className="sr-only">Buscar</span>
              <AffixInput
                prefix={<Search className="size-5 text-ink-2" aria-hidden />}
                type="search"
                placeholder="Producto, productor o zona"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Estado</span>
              <select className="w-full" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                {STATUS_FILTERS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Ordenar</span>
              <select className="w-full" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    Orden: {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {list.error && (
          <Notice
            tone="danger"
            title="No se pudo leer la red de Stellar"
            action={
              <button className="btn-secondary btn-sm" onClick={list.refresh}>
                Reintentar
              </button>
            }
          >
            {list.error}
          </Notice>
        )}

        {!items && !list.error && (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" aria-busy aria-label="Cargando preventas">
            {[0, 1, 2].map((i) => (
              <CampaignCardSkeleton key={i} />
            ))}
          </div>
        )}

        {items && shown.length === 0 && <Empty selected={selected} filtered={!!query || effectiveStatus !== "live"} />}

        {shown.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {shown.map((i) => (
              <CampaignCard
                key={i.c.id.toString()}
                c={i.c}
                meta={i.meta.meta}
                category={i.category}
                producer={producers.data?.[i.c.seller] ?? (producers.loading ? null : undefined)}
                now={now}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** The three steps, one tap away instead of three cards on the page. */
function HowItWorks() {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-bold text-brand">
        ¿Cómo funciona?
        <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="space-y-2 text-ink-2 [&_b]:text-ink">
        <li>
          <b>1. Reservas hoy</b> al precio de hoy, en dólares digitales.
        </li>
        <li>
          <b>2. Tu pago queda en custodia</b> en un contrato de Stellar: ni el productor ni Ayni pueden tocarlo.
        </li>
        <li>
          <b>3. Recibes y confirmas.</b> Recién ahí cobra el productor. Si no se llega al mínimo, recuperas el 100%. Si el productor no
          cumple, se te devuelve hasta lo que pagaste: de la custodia, de su aval y del fondo común.
        </li>
      </ol>
    </details>
  );
}

function Chip({ on, onClick, label, category, soon }: { on: boolean; onClick: () => void; label: string; category?: CategoryDef; soon?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-pressed={on} className="chip">
        {category && <CategoryIcon category={category} className="size-[18px]" />}
        {label}
        {soon && <span className={on ? "font-normal" : "font-normal text-ink-2"}>· pronto</span>}
      </button>
    </li>
  );
}

function Empty({ selected, filtered }: { selected: CategoryDef | null; filtered: boolean }) {
  if (selected?.comingSoon) {
    return (
      <EmptyState icon={<CategoryIcon category={selected} className="size-10" />} title={`${selected.label}: muy pronto`}>
        El mismo contrato sirve para preventas grandes: pagos en custodia que se liberan por hitos de obra aprobados por un{" "}
        {selected.verifierLabel.toLowerCase()}, con un aval de la {copy(selected, "producerNoun")}.
      </EmptyState>
    );
  }
  if (filtered) {
    return (
      <EmptyState icon={<SearchX className="size-10" />} title="Nada coincide">
        Prueba con otra palabra o cambia el estado.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon={selected ? <CategoryIcon category={selected} className="size-10" /> : undefined}
      title={selected ? `Todavía no hay preventas de ${selected.label.toLowerCase()}` : "Todavía no hay preventas"}
      action={{ href: "/producer", label: "¿Eres productor? Publica la primera" }}
    />
  );
}
