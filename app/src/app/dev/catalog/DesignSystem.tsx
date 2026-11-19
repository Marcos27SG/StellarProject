"use client";

// Dev-only gallery of every Ayni primitive (design boards 03–06), with sample data. Check it in light
// and dark (the system setting), at 360 px and on desktop. Nothing here ships to production.

import {
  CalendarDays,
  Clock,
  Eye,
  FileText,
  Hand,
  House,
  Lock,
  MapPin,
  PenLine,
  QrCode,
  RotateCcw,
  Scale,
  ScanLine,
  Search,
  Share,
  ShieldCheck,
  Star,
  Store,
  Ticket,
  User,
  WifiOff,
  BadgeCheck,
  History,
} from "lucide-react";
import { useState } from "react";
import { getCategory } from "@/catalog";
import { Stepper } from "@/components/ActionPanel";
import { MoneyStatus, AffixInput, CampaignCardSkeleton, Dialog, EmptyState, Field, Hint, MoneyBox, Notice, Spinner, SummaryRow, Tip, TxSteps, VoucherSkeleton, type TxPhase } from "@/components/ui";
import { Stars, StatusPill, Streak, TierBadge, TierLadder, VOUCHER_STATUS, VoucherPill, type VoucherState } from "@/components/badges";
import { CategoryIcon } from "@/components/CategoryIcon";
import { FundingBar } from "@/components/FundingBar";
import { ApartmentIcon, BasketIcon, CoffeeIcon, CrateIcon, EggIcon, MilkIcon, PoolIcon } from "@/components/icons";
import { AyniMark, Logo } from "@/components/Logo";
import { Money } from "@/components/Money";
import { VoucherQR } from "@/components/MyVouchers";
import { Puntada } from "@/components/Puntada";
import { useToast } from "@/components/Toast";
import { voucherCode, VoucherTicket } from "@/components/VoucherTicket";
import { toAmount, type Campaign, type StatusTag } from "@/lib/despensa";

const DAY = 86_400n;
const BUYER = "GCCNUJF362MBLA3RN2G3VH4KDMVTNNPS5M32AL5CFW65H66PIHC3L33P";
const milk = getCategory("dairy.milk");
const CATS = ["dairy.milk", "eggs", "veg_basket", "real_estate.apartment", "generic"].map((id) => getCategory(id));

function mk(now: bigint, o: Partial<Campaign> & { tag?: StatusTag }): Campaign {
  const { tag = "Funding", ...rest } = o;
  return {
    id: 7n,
    seller: BUYER,
    verifier: BUYER,
    title: "Leche fresca entera",
    metadata_uri: "",
    unit_price: toAmount("0.90"),
    min_units: 400,
    max_units: 1000,
    sale_end: now + 4n * DAY,
    delivery_deadline: now + 11n * DAY,
    milestones: [],
    bond_cover_bps: 5000,
    dispute_window: 3n * DAY,
    status: { tag } as Campaign["status"],
    sold: 640,
    delivered: 0,
    pending: 0,
    refunded: 0,
    released_bps: 0,
    advanced: 0n,
    escrow: 0n,
    bond_total: 0n,
    bond_slashed: 0n,
    refund_per_unit: 0n,
    created_at: now - DAY,
    ...rest,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-line pt-6">
      <h2 className="t-title-2">{title}</h2>
      {children}
    </section>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <p className="t-label text-ink-2">{children}</p>;

export function DesignSystem({ now }: { now: bigint }) {
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [alert, setAlert] = useState(false);
  const [units, setUnits] = useState(10);
  const [replay, setReplay] = useState(0);
  const phases: TxPhase[] = ["preparing", "signing", "confirming", "done", "pending", "unconfirmed", "error"];
  const c = mk(now, {});

  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-2">
        <p className="t-label text-ink-2">Solo en desarrollo · Ronda 2 · Tejido</p>
        <h1 className="t-display">Sistema de diseño</h1>
        <p className="text-ink-2">Cada primitiva de los tableros 03 a 06 con datos de muestra. Revísala en claro y oscuro, a 360 px y en escritorio.</p>
      </header>

      <Section title="Marca y la puntada">
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <Logo size="lg" />
          <AyniMark className="size-4" title="Ayni (16 px)" />
          <span className="rounded-md bg-ink p-2">
            <AyniMark tone="inverse" className="size-8" />
          </span>
          <Puntada key={replay} className="size-16" />
          <button type="button" className="btn-secondary" onClick={() => setReplay((n) => n + 1)}>
            Repetir la puntada
          </button>
        </div>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-lg">
            Reservar <span className="opacity-50">·</span> <span className="font-display [font-stretch:105%]">$us 9,00</span>
          </button>
          <button type="button" className="btn-secondary btn-lg">
            <Share className="size-5" aria-hidden /> Compartir
          </button>
          <button type="button" className="btn-ghost btn-lg">
            <Eye className="size-5" aria-hidden /> Ver la prueba
          </button>
          <button type="button" className="btn-danger btn-lg">
            Abrir disputa
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-lg" aria-busy>
            <Spinner /> Firmando…
          </button>
          <button type="button" className="btn btn-lg" disabled>
            Reservar
          </button>
          <button type="button" className="btn-secondary" disabled>
            Calificar
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className="btn-secondary btn-lg">
            <Star className="size-5" aria-hidden /> lg · 52
          </button>
          <button type="button" className="btn-secondary">
            <Star className="size-5" aria-hidden /> md · 44
          </button>
          <button type="button" className="btn-secondary btn-sm">
            <Star className="size-5" aria-hidden /> sm · 36 (solo con mouse)
          </button>
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label="Nombre del producto" hint="Así lo verán los compradores.">
            <input className="w-full" defaultValue="Leche fresca entera" />
          </Field>
          <Field label="Precio por unidad" hint="Precio fijo hasta la entrega.">
            <AffixInput prefix="$us" suffix="≈ Bs 10,80" defaultValue="0,90" inputMode="decimal" />
          </Field>
          <Field label="Cantidad mínima" error="No puede ser mayor que la máxima (1.000).">
            <AffixInput suffix="litros" defaultValue="2000" aria-invalid inputMode="numeric" />
          </Field>
          <div role="group" aria-labelledby="ds-qty">
            <p id="ds-qty" className="mb-1.5 text-[0.9375rem] font-bold">
              Cantidad (litros)
            </p>
            <Stepper value={units} onChange={setUnits} max={20} unit="litros" />
            <p className="t-detail mt-1.5 text-ink-2">Quedan 360 · máximo 20 por persona</p>
          </div>
        </div>
      </Section>

      <Section title="Chips de categoría">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button type="button" className="chip" aria-pressed="true">
            Todo
          </button>
          {CATS.map((cat) => (
            <button key={cat.id} type="button" className="chip" aria-pressed="false">
              <CategoryIcon category={cat} className="size-[18px]" />
              {cat.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Estados">
        <Label>Vales</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(VOUCHER_STATUS) as VoucherState[]).map((s) => (
            <VoucherPill key={s} state={s} />
          ))}
        </div>
        <Label>Operaciones</Label>
        <div className="flex flex-wrap gap-2">
          <MoneyStatus state="pending" />
          <MoneyStatus state="unconfirmed" />
          <MoneyStatus state="completed" />
          <MoneyStatus state="failed" />
        </div>
        <Label>Campañas</Label>
        <div className="flex flex-wrap gap-2">
          {(["Funding", "Active", "Completed", "Failed", "Defaulted"] as StatusTag[]).map((t) => (
            <StatusPill key={t} status={t} />
          ))}
        </div>
      </Section>

      <Section title="Niveles">
        <div className="flex flex-wrap items-center gap-5">
          {[0, 1, 2, 3, 4].map((t) => (
            <TierBadge key={t} tier={t} />
          ))}
        </div>
        <TierLadder current={2} />
      </Section>

      <Section title="Racha y estrellas">
        <div className="grid gap-5 sm:grid-cols-3">
          <Streak n={0} showZero />
          <Streak n={3} />
          <Streak n={15} />
        </div>
        <div className="flex flex-col gap-2">
          <Stars value={4.8} count={36} />
          <Stars value={3.5} count={4} size="sm" />
          <Stars value={null} />
          <Streak n={4} compact />
        </div>
      </Section>

      <Section title="Barra de financiamiento">
        <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
          <FundingBar c={mk(now, { sold: 180 })} category={milk} now={now} />
          <FundingBar c={mk(now, { sold: 640 })} category={milk} now={now} />
          <FundingBar c={mk(now, { sold: 1000 })} category={milk} now={now} />
          <FundingBar c={mk(now, { sold: 220, tag: "Failed" })} category={milk} now={now} />
          <FundingBar c={mk(now, { sold: 220, sale_end: now - DAY })} category={milk} now={now} />
          <FundingBar c={mk(now, { sold: 640, tag: "Active" })} category={milk} now={now} size="lg" />
        </div>
      </Section>

      <Section title="Dinero">
        <div className="flex flex-wrap items-baseline gap-6">
          <Money amount={toAmount("9")} size="sm" />
          <Money amount={toAmount("9")} />
          <Money amount={toAmount("1120.5")} size="lg" />
          <Money amount={toAmount("0.9")} size="xl" category={milk} />
        </div>
      </Section>

      <Section title="Vale">
        <div className="grid max-w-3xl items-start gap-5 sm:grid-cols-2">
          <VoucherTicket
            state="pickup"
            code={voucherCode(c.id, BUYER)}
            category={milk}
            heading="10 litros · Leche fresca entera"
            subheading={
              <span className="inline-flex flex-wrap items-center gap-x-2">
                Familia de ejemplo · <TierBadge tier={2} />
              </span>
            }
            place="Feria de la plaza, puesto 14"
            when="Sábados 7–11 · entrega hasta el sáb 29 nov"
            waiting={toAmount("9")}
          >
            <VoucherQR c={c} buyer={BUYER} units={10} category={milk} />
          </VoucherTicket>
          <VoucherTicket state="confirm" category={milk} heading="10 litros · Leche fresca entera" waiting={toAmount("9")}>
            <button type="button" className="btn btn-lg w-full">
              <QrCode className="size-5" aria-hidden /> Mostrar QR para recoger
            </button>
          </VoucherTicket>
        </div>
      </Section>

      <Section title="Estado de la operación">
        <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
          {phases.map((p) => (
            <div key={p} className="card space-y-2 p-4 shadow-none">
              <Label>{p}</Label>
              <TxSteps phase={p} hash={p === "signing" || p === "preparing" || p === "confirming" ? undefined : "abc"} success="Tus $us 9,00 ya esperan en el contrato." error="La red rechazó la operación." failedAt="signing" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Hoja, diálogo, avisos y consejos">
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={() => setSheet(true)}>
            Abrir hoja
          </button>
          <button type="button" className="btn-danger" onClick={() => setAlert(true)}>
            Abrir diálogo de alerta
          </button>
          <button type="button" className="btn-secondary" onClick={() => toast({ text: "Reserva guardada. Ya está en Mis vales.", action: { label: "Ver vale", href: "/me" } })}>
            Aviso de éxito
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => toast({ tone: "error", text: "Sin conexión. Tu dinero no se movió.", action: { label: "Reintentar", onClick: () => {} } })}
          >
            Aviso de error
          </button>
        </div>
        <div className="grid max-w-3xl gap-3">
          <p>
            Fondo comunitario{" "}
            <Hint label="Qué es: Fondo comunitario">
              El 2% de cada cobro va a un fondo común que ayuda a cubrir los reembolsos si un productor falla. <a href="#">Ver la prueba</a>
            </Hint>
          </p>
          <Tip id="dev-catalog">Paga solo lo que puedas esperar hasta la fecha de entrega.</Tip>
          {(["info", "warning", "danger", "success", "neutral", "brand"] as const).map((t) => (
            <Notice key={t} tone={t} title={`Aviso ${t}`}>
              Texto del aviso, en tinta sobre el tinte.
            </Notice>
          ))}
        </div>
        <Dialog open={sheet} onClose={() => setSheet(false)} title="Confirma tu reserva">
          <div className="space-y-3.5">
            <SummaryRow label="10 litros × $us 0,90" value="$us 9,00" />
            <div className="h-px bg-line" />
            <SummaryRow
              strong
              label="Pagas ahora"
              value={
                <>
                  $us 9,00 <span className="font-normal text-ink-2">≈ Bs 108</span>
                </>
              }
            />
            <MoneyBox
              lines={[
                { icon: Lock, text: <>Tu dinero va a un <b>contrato público</b>, no a Ayni ni al productor.</> },
                { icon: RotateCcw, text: "Si no se llega al mínimo, vuelve a ti completo." },
              ]}
            />
            <button type="button" className="btn btn-lg w-full">
              Confirmar y pagar <span className="opacity-50">·</span> $us 9,00
            </button>
            <button type="button" className="btn-ghost w-full" onClick={() => setSheet(false)}>
              Volver
            </button>
          </div>
        </Dialog>
        <Dialog open={alert} onClose={() => setAlert(false)} title="¿Abrir una disputa?" variant="alert" icon={Scale}>
          <div className="space-y-3">
            <p>
              Los <b>$us 9,00</b> quedan congelados. Nadie cobra hasta que el verificador decida.
            </p>
            <p className="flex items-center gap-1.5 text-sm font-bold text-danger">No se puede deshacer.</p>
            <button type="button" className="btn-danger btn-lg w-full">
              Abrir disputa
            </button>
            <button type="button" className="btn-secondary w-full" onClick={() => setAlert(false)}>
              Mejor no
            </button>
          </div>
        </Dialog>
      </Section>

      <Section title="Vacío y carga">
        <div className="grid max-w-4xl items-start gap-4 sm:grid-cols-3">
          <EmptyState title="Todavía no tienes vales" action={{ href: "/", label: "Ver preventas" }}>
            Cuando reserves algo, aparece aquí con su fecha y lugar de entrega.
          </EmptyState>
          <CampaignCardSkeleton />
          <VoucherSkeleton />
        </div>
      </Section>

      <Section title="Íconos">
        <Label>Categorías (propios)</Label>
        <div className="flex flex-wrap gap-5 text-brand">
          {[MilkIcon, EggIcon, BasketIcon, CoffeeIcon, ApartmentIcon, CrateIcon].map((I, i) => (
            <span key={i} className="flex items-end gap-2">
              <I className="size-8" />
              <I className="size-6" />
              <I className="size-4" />
            </span>
          ))}
        </div>
        <Label>Interfaz (lucide, y Fondo común propio)</Label>
        <div className="flex flex-wrap gap-4 text-ink">
          {[House, Ticket, Store, User, Search, ShieldCheck, Lock, FileText, PoolIcon, QrCode, ScanLine, Share, History, Scale, PenLine, Clock, CalendarDays, MapPin, Star, BadgeCheck, Eye, WifiOff, Hand].map(
            (I, i) => (
              <I key={i} className="size-7" strokeWidth={2} aria-hidden />
            ),
          )}
        </div>
      </Section>
    </div>
  );
}
