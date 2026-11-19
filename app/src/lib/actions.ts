// "What can this person do now?" — the single source of truth.
// Pure and synchronous: no SDK, no React. Components render Action[] and never re-derive rules.
// Mirrors the guards in contracts/despensa/src/lib.rs so buttons never lead to a contract error.

import { copy, generic, unitLabel, type CategoryDef } from "@/catalog";
import type { Campaign, Holding } from "./despensa";
import type { PendingDelivery } from "./events";
import { formatPct } from "./format";

export type Role = "buyer" | "seller" | "verifier" | "guarantor";

export type ActionId =
  | "buy"
  | "transfer"
  | "show_qr"
  | "confirm"
  | "dispute"
  | "finalize"
  | "rate"
  | "claim_refund"
  | "add_bond"
  | "close_sale"
  | "cancel"
  | "submit_milestone"
  | "deliver"
  | "approve_milestone"
  | "resolve_dispute"
  | "declare_default"
  | "withdraw_bond"
  | "settle";

/** Contract method the action calls. `null` = local UI only (e.g. show the QR). */
export type ContractMethod =
  | "buy"
  | "transfer_units"
  | "confirm_delivery"
  | "dispute"
  | "finalize_delivery"
  | "rate"
  | "claim_refund"
  | "add_bond"
  | "close_sale"
  | "cancel"
  | "submit_milestone"
  | "mark_delivered"
  | "approve_milestone"
  | "resolve_dispute"
  | "declare_default"
  | "withdraw_bond"
  | "settle";

/** What the UI must collect before submitting. */
export type ActionInput =
  | "units"
  | "units_and_address"
  | "stars"
  | "amount"
  | "evidence"
  /** Manual fallback: the buyer is not in the loaded list, so the user types the address. */
  | "buyer_address"
  | "buyer_and_verdict"
  /** The buyer is known (Action.buyer): only ask "¿la entrega ocurrió?". */
  | "verdict";

export interface Action {
  id: ActionId;
  role: Role;
  method: ContractMethod | null;
  /** Short Spanish button label. */
  label: string;
  /** One line: the consequence of doing it. */
  description: string;
  input?: ActionInput;
  /** Upper bound for a units input. */
  maxUnits?: number;
  /** For milestone actions. */
  milestoneIndex?: number;
  /** Target buyer for actions on someone else's holding (finalize, resolve_dispute). */
  buyer?: string;
  /** Present when the action is irreversible or moves money: the UI must show a confirm step. */
  confirm?: string;
  /** It can't be undone (money is released, a decision is final). The confirm step says so prominently. */
  irreversible?: boolean;
  /**
   * Present when the action is visible but would fail on-chain right now. The UI renders it disabled
   * with this reason. Disabled actions are sorted last and are never the primary CTA.
   */
  disabled?: string;
  tone: "primary" | "default" | "danger";
}

export interface ActionContext {
  /** Ledger time in seconds. */
  now: bigint;
  /** The campaign's dispute window in seconds (campaign.dispute_window, fixed when it was created). */
  disputeWindow: bigint;
  /** This address's bond on the campaign (bond_of). */
  bond?: bigint;
  category?: CategoryDef;
  /**
   * Buyers with pending deliveries (lib/events.ts listPendingDeliveries). Used by the seller
   * (collect after the dispute window) and the verifier (open disputes). When it is missing, or
   * explains fewer units than campaign.pending, a manual "enter the buyer's address" action is added.
   */
  deliveries?: PendingDelivery[];
}

const BPS = BigInt(10_000);

// ------------------------------------------------------------------ roles

/** Roles derived from the connected address. One address can hold several. No role picker. */
export function deriveRoles(
  campaign: Pick<Campaign, "seller" | "verifier" | "status">,
  address: string | null,
  bond: bigint = BigInt(0),
): Role[] {
  if (!address) return ["buyer"]; // visitors see the buy CTA (it asks them to sign in)
  const roles: Role[] = [];
  const isSeller = address === campaign.seller;
  const isVerifier = address === campaign.verifier;
  if (isSeller) roles.push("seller");
  if (isVerifier) roles.push("verifier");
  if (!isSeller && !isVerifier) roles.push("buyer");
  // Anyone can post a bond ("aval solidario") while the sale is open; afterwards only existing guarantors act.
  if (!isSeller && (bond > BigInt(0) || campaign.status.tag === "Funding")) roles.push("guarantor");
  return roles;
}

// ------------------------------------------------------------------ helpers

function settleAt(c: Campaign, w: bigint) {
  return c.delivery_deadline + BigInt(2) * w;
}

/** Bond the verifier needs on the campaign to approve milestone `index` now (approve_milestone guard). */
export function requiredBondFor(c: Campaign, index: number): bigint {
  const m = c.milestones[index];
  if (!m) return BigInt(0);
  const undelivered = BigInt(c.sold - c.delivered);
  const gross = (undelivered * c.unit_price * BigInt(m.bps)) / BPS;
  return ((c.advanced + gross) * BigInt(c.bond_cover_bps)) / BPS;
}

/** Amount a guarantor gets back from withdraw_bond. */
export function withdrawableBond(c: Campaign, bond: bigint): bigint {
  if (bond <= BigInt(0)) return BigInt(0);
  switch (c.status.tag) {
    case "Completed":
    case "Failed":
      return bond;
    case "Defaulted":
      return c.bond_total > BigInt(0) ? (bond * (c.bond_total - c.bond_slashed)) / c.bond_total : BigInt(0);
    default:
      return BigInt(0);
  }
}

function pendingMilestones(c: Campaign) {
  return c.milestones
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !m.released && m.evidence.length > 0);
}

function closeExpiredSale(c: Campaign, role: Role): Action {
  const reached = c.sold >= c.min_units;
  return {
    id: "close_sale",
    role,
    method: "close_sale",
    label: "Cerrar preventa",
    description: reached
      ? "La preventa terminó y llegó al mínimo: pasa a producción."
      : "La preventa terminó sin llegar al mínimo: se habilitan los reembolsos del 100%.",
    tone: "primary",
  };
}

function settleAction(role: Role, c: Campaign): Action {
  const allDelivered = c.delivered === c.sold;
  return {
    id: "settle",
    role,
    method: "settle",
    label: "Liquidar campaña",
    description: allDelivered
      ? "Venció el plazo y todo fue entregado: la campaña se completa."
      : c.pending > 0
        ? "Hay entregas sin finalizar: si se liquida ahora cuentan como no entregadas y la campaña queda incumplida. Finalízalas primero."
        : "Venció el plazo sin entregar todo: se declara incumplida y se habilitan los reembolsos.",
    confirm: "Esta acción cierra la campaña de forma definitiva.",
    irreversible: true,
    tone: "primary",
  };
}

// ------------------------------------------------------------------ per role

function buyerActions(c: Campaign, h: Holding | null, ctx: ActionContext): Action[] {
  const cat = ctx.category ?? generic;
  const voucher = copy(cat, "voucherNoun");
  const out: Action[] = [];
  const held = h?.units ?? 0;
  const pending = h?.pending ?? 0;
  const outstanding = held + pending;
  const role: Role = "buyer";

  switch (c.status.tag) {
    case "Funding": {
      if (ctx.now >= c.sale_end) {
        out.push(closeExpiredSale(c, role));
        break;
      }
      const left = c.max_units - c.sold;
      if (left > 0) {
        out.push({
          id: "buy",
          role,
          method: "buy",
          label: "Reservar",
          description: `Pagas hoy al precio bloqueado. Si no se llega al mínimo de ${c.min_units} ${unitLabel(cat, c.min_units)}, recuperas el 100%.`,
          input: "units",
          maxUnits: cat.unit.maxPerOrder ? Math.min(left, cat.unit.maxPerOrder) : left,
          confirm: "El pago queda en custodia hasta que recibas tu pedido.",
          tone: "primary",
        });
      }
      if (held > 0) out.push(transferAction(role, held, voucher));
      break;
    }
    case "Active": {
      const disputed = h?.disputed ?? false;
      const windowEnd = h ? h.pending_since + ctx.disputeWindow : BigInt(0);
      const inWindow = pending > 0 && ctx.now < windowEnd;
      let confirmShown = false;
      if (pending > 0 && !disputed && inWindow) {
        confirmShown = true;
        out.push({
          id: "confirm",
          role,
          method: "confirm_delivery",
          label: capitalize(copy(cat, "confirmVerb")),
          description: "El productor dice que ya te entregó. Si es así, confírmalo y se le paga.",
          input: "units",
          maxUnits: outstanding,
          confirm: "Confirmar libera el pago al productor. No se puede deshacer.",
          irreversible: true,
          tone: "primary",
        });
        out.push({
          id: "dispute",
          role,
          method: "dispute",
          label: "No recibí: abrir disputa",
          description: "Congela el pago hasta que un verificador independiente decida.",
          confirm: "Abre una disputa solo si no recibiste lo que dice el productor.",
          // Only the verifier can close a dispute: the buyer can't withdraw it.
          irreversible: true,
          tone: "danger",
        });
      }
      if (held > 0) {
        out.push({
          id: "show_qr",
          role,
          method: null,
          label: `Mostrar mi ${voucher}`,
          description: `Muestra este código en la entrega. El productor lo escanea para ${copy(cat, "deliveryVerb")}.`,
          tone: "default",
        });
      }
      if (pending > 0 && !disputed && !inWindow) {
        out.push({
          id: "finalize",
          role,
          method: "finalize_delivery",
          label: "Finalizar entrega",
          description: "Pasó el plazo de disputa sin reclamos: se cierra la entrega y se paga al productor.",
          tone: "default",
        });
      }
      if (!confirmShown && outstanding > 0) {
        out.push({
          id: "confirm",
          role,
          method: "confirm_delivery",
          label: capitalize(copy(cat, "confirmVerb")),
          description: disputed
            ? "Si al final sí recibiste, confirmar cierra la disputa y paga al productor."
            : "Confirma solo lo que ya tienes en tus manos: se paga al productor al instante.",
          input: "units",
          maxUnits: outstanding,
          confirm: "Confirmar libera el pago al productor. No se puede deshacer.",
          irreversible: true,
          tone: "default",
        });
      }
      if (held > 0) out.push(transferAction(role, held, voucher));
      if (outstanding > 0 && ctx.now >= settleAt(c, ctx.disputeWindow)) {
        out.unshift(settleAction(role, c));
      }
      break;
    }
    case "Completed": {
      if (h && (h.delivered > 0 || h.refunded > 0) && !h.rated) out.push(rateAction(role));
      break;
    }
    case "Failed": {
      if (outstanding > 0) out.push(refundAction(role, "Recuperas el 100% de lo que pagaste."));
      break;
    }
    case "Defaulted": {
      if (outstanding > 0) {
        out.push(
          refundAction(role, "Se te devuelve desde la custodia, luego el aval y luego el fondo común."),
        );
      }
      if (h && (h.delivered > 0 || h.refunded > 0) && !h.rated) out.push(rateAction(role));
      break;
    }
  }
  return normalize(out);
}

function sellerActions(c: Campaign, ctx: ActionContext): Action[] {
  const cat = ctx.category ?? generic;
  const out: Action[] = [];
  const role: Role = "seller";

  switch (c.status.tag) {
    case "Funding": {
      if (ctx.now >= c.sale_end) {
        out.push(closeExpiredSale(c, role));
        break;
      }
      if (c.sold >= c.min_units) {
        out.push({
          id: "close_sale",
          role,
          method: "close_sale",
          label: "Cerrar preventa y empezar",
          description: "Ya llegaste al mínimo. Cierras la venta y pasas a producción.",
          confirm: "Después de cerrar ya no se puede vender más.",
          irreversible: true,
          tone: "primary",
        });
      }
      out.push(bondAction(role, "Bloquea un aval para poder recibir adelantos por hitos."));
      out.push({
        id: "cancel",
        role,
        method: "cancel",
        label: "Cancelar preventa",
        description: "Sin penalidad: todos los compradores recuperan el 100%.",
        confirm: "Los compradores podrán pedir su reembolso. No se puede deshacer.",
        irreversible: true,
        tone: "danger",
      });
      break;
    }
    case "Active": {
      // Collect first: settle counts unfinalized deliveries as undelivered, which would default the campaign.
      const { known, unexplained } = deliveryView(c, ctx);
      for (const d of known) {
        if (d.holding.disputed || ctx.now < d.holding.pending_since + ctx.disputeWindow) continue;
        out.push({
          id: "finalize",
          role,
          method: "finalize_delivery",
          buyer: d.buyer,
          label: `Cobrar entrega a ${short(d.buyer)}`,
          description: `Pasó el plazo de disputa sin reclamos: se te paga por ${d.holding.pending} ${unitLabel(cat, d.holding.pending)}.`,
          tone: "primary",
        });
      }
      if (unexplained > 0) {
        out.push({
          id: "finalize",
          role,
          method: "finalize_delivery",
          label: "Cobrar una entrega (ingresar comprador)",
          description: `Hay entregas pendientes por ${unexplained} ${unitLabel(cat, unexplained)} que no aparecen en la lista. Si ya pasó el plazo de disputa del comprador, ingresa su dirección para cobrar.`,
          input: "buyer_address",
          tone: "default",
        });
      }
      if (ctx.now >= settleAt(c, ctx.disputeWindow)) {
        out.push(settleAction(role, c));
      }
      out.push({
        id: "deliver",
        role,
        method: "mark_delivered",
        label: `Escanear QR y ${copy(cat, "deliveryVerb")}`,
        description: "Registra la entrega. Se te paga cuando el comprador confirma o al terminar el plazo de disputa.",
        input: "units_and_address",
        tone: "primary",
      });
      c.milestones.forEach((m, i) => {
        if (m.released) return;
        out.push({
          id: "submit_milestone",
          role,
          method: "submit_milestone",
          milestoneIndex: i,
          label: m.evidence ? `Actualizar evidencia: ${m.title}` : `Enviar evidencia: ${m.title}`,
          description: `El verificador la revisa para liberar el adelanto del ${formatPct(m.bps)}.`,
          input: "evidence",
          tone: "default",
        });
      });
      const shortfall = bondShortfall(c);
      if (shortfall > BigInt(0)) {
        out.push(bondAction(role, "El aval actual no cubre el próximo adelanto. Súmale para que pueda aprobarse."));
      }
      out.push({
        id: "cancel",
        role,
        method: "cancel",
        label: "Cancelar (incumplimiento)",
        description: "Cuenta como incumplimiento: los compradores se reembolsan y pierdes reputación.",
        confirm: "Se usará tu aval para reembolsar a los compradores, pierdes tu racha y puedes bajar a nivel Restringido (sin adelantos).",
        irreversible: true,
        tone: "danger",
      });
      break;
    }
    case "Completed":
    case "Failed":
    case "Defaulted": {
      // A producer who posted their own bond gets it back like any guarantor (bonds are not auto-returned).
      const withdraw = withdrawAction(role, c, ctx.bond ?? BigInt(0));
      if (withdraw) out.push(withdraw);
      break;
    }
  }
  return normalize(out);
}

function verifierActions(c: Campaign, ctx: ActionContext): Action[] {
  const out: Action[] = [];
  const role: Role = "verifier";
  if (c.status.tag !== "Active") return out;

  if (ctx.now >= settleAt(c, ctx.disputeWindow)) out.push(settleAction(role, c));
  for (const { m, i } of pendingMilestones(c)) {
    const covered = c.bond_total >= requiredBondFor(c, i);
    out.push({
      id: "approve_milestone",
      role,
      method: "approve_milestone",
      milestoneIndex: i,
      label: `Aprobar hito: ${m.title}`,
      description: `Libera un adelanto del ${formatPct(m.bps)} al productor.`,
      confirm: "Revisaste la evidencia. El adelanto se paga al instante y no se puede revertir.",
      irreversible: true,
      disabled: covered
        ? undefined
        : "El aval no alcanza para cubrir este adelanto: el productor o un garante debe sumar aval antes de aprobar.",
      tone: "primary",
    });
  }
  const cat = ctx.category ?? generic;
  const { known, unexplained } = deliveryView(c, ctx);
  for (const d of known) {
    if (!d.holding.disputed) continue;
    out.push({
      id: "resolve_dispute",
      role,
      method: "resolve_dispute",
      buyer: d.buyer,
      label: `Resolver disputa de ${short(d.buyer)}`,
      description: `Dice que no recibió ${d.holding.pending} ${unitLabel(cat, d.holding.pending)}. Decides si la entrega ocurrió (se paga al productor) o no (el comprador recupera sus ${copy(cat, "voucherNoun")}s).`,
      input: "verdict",
      confirm: "Tu decisión es definitiva.",
      irreversible: true,
      tone: "default",
    });
  }
  if (unexplained > 0) {
    out.push({
      id: "resolve_dispute",
      role,
      method: "resolve_dispute",
      label: "Resolver una disputa (ingresar comprador)",
      description: "Hay entregas pendientes que no aparecen en la lista. Si un comprador abrió una disputa, ingresa su dirección.",
      input: "buyer_and_verdict",
      confirm: "Tu decisión es definitiva.",
      irreversible: true,
      tone: "default",
    });
  }
  out.push({
    id: "declare_default",
    role,
    method: "declare_default",
    label: "Declarar incumplimiento",
    description: "Si el productor desapareció o hubo fraude: se reembolsa a los compradores.",
    confirm: "Cierra la campaña como incumplida y usa el aval. No se puede deshacer.",
    irreversible: true,
    tone: "danger",
  });
  return normalize(out);
}

function guarantorActions(c: Campaign, ctx: ActionContext): Action[] {
  const out: Action[] = [];
  const role: Role = "guarantor";
  const bond = ctx.bond ?? BigInt(0);

  switch (c.status.tag) {
    case "Funding":
      out.push(bondAction(role, "Respaldas al productor. Si cumple, recuperas todo tu aval."));
      break;
    case "Active":
      if (ctx.now >= settleAt(c, ctx.disputeWindow) && bond > BigInt(0)) out.push(settleAction(role, c));
      if (bondShortfall(c) > BigInt(0)) {
        out.push(bondAction(role, "El aval actual no cubre el próximo adelanto del productor."));
      }
      break;
    case "Completed":
    case "Failed":
    case "Defaulted": {
      const withdraw = withdrawAction(role, c, bond);
      if (withdraw) out.push(withdraw);
      break;
    }
  }
  return normalize(out);
}

// ------------------------------------------------------------------ public API

/**
 * Ordered actions for one role. The first one is the primary CTA.
 * `holding` is only used for the buyer role (pass null otherwise or when the address has none).
 */
export function nextActions(
  campaign: Campaign,
  holding: Holding | null,
  role: Role,
  now: bigint,
  extra: Omit<ActionContext, "now" | "disputeWindow"> = {},
): Action[] {
  const ctx: ActionContext = { now, disputeWindow: campaign.dispute_window, ...extra };
  switch (role) {
    case "buyer":
      return buyerActions(campaign, holding, ctx);
    case "seller":
      return sellerActions(campaign, ctx);
    case "verifier":
      return verifierActions(campaign, ctx);
    case "guarantor":
      return guarantorActions(campaign, ctx);
  }
}

/** Actions for every role an address holds, de-duplicated by contract call (settle / close_sale appear once). */
export function actionsForRoles(
  campaign: Campaign,
  holding: Holding | null,
  roles: Role[],
  now: bigint,
  extra: Omit<ActionContext, "now" | "disputeWindow"> = {},
): Record<Role, Action[]> {
  const seen = new Set<string>();
  const out = { buyer: [], seller: [], verifier: [], guarantor: [] } as Record<Role, Action[]>;
  for (const role of roles) {
    out[role] = nextActions(campaign, holding, role, now, extra).filter((a) => {
      const shared = a.id === "settle" || (a.id === "close_sale" && now >= campaign.sale_end);
      if (!shared) return true;
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }
  return out;
}

// ------------------------------------------------------------------ dashboards

const ATTENTION: ReadonlySet<ActionId> = new Set<ActionId>([
  "close_sale",
  "finalize",
  "settle",
  "withdraw_bond",
  "approve_milestone",
  "resolve_dispute",
  "claim_refund",
  "add_bond",
]);

/**
 * Actions worth an "acción pendiente" badge on a dashboard: things that unblock money or close the
 * campaign. Excludes routine ones (deliver, evidence), manual fallbacks, disabled actions, and the
 * optional bond during the sale.
 */
export function attentionActions(actions: Action[], c: Pick<Campaign, "status">): Action[] {
  return actions.filter(
    (a) =>
      ATTENTION.has(a.id) &&
      !a.disabled &&
      a.input !== "buyer_address" &&
      a.input !== "buyer_and_verdict" &&
      !(a.id === "add_bond" && c.status.tag === "Funding"),
  );
}

// ------------------------------------------------------------------ feedback

/** What just happened, in one line, shown once the transaction is confirmed. */
export function successMessage(a: Pick<Action, "id">, category: CategoryDef = generic): string {
  const voucher = copy(category, "voucherNoun");
  const messages: Record<ActionId, string> = {
    buy: `¡Listo! Tu pago quedó en custodia y tu ${voucher} ya está en Mis vales.`,
    transfer: `Listo: esos ${voucher}s ya son de la otra persona.`,
    show_qr: "",
    confirm: "Confirmado: se le pagó al productor. ¡Gracias por comprar local!",
    dispute: "Disputa abierta: el pago queda congelado hasta que decida el verificador.",
    finalize: "Entrega cerrada: el pago se liberó al productor.",
    rate: "¡Gracias! Tu calificación ya forma parte de su reputación.",
    claim_refund: "Reembolso enviado a tu cuenta.",
    add_bond: "Aval depositado en el contrato.",
    close_sale: "Preventa cerrada.",
    cancel: "Preventa cancelada: los compradores ya pueden pedir su reembolso.",
    submit_milestone: "Evidencia enviada: el verificador la revisará.",
    deliver: "Entrega registrada: el comprador ya puede confirmarla desde su teléfono.",
    approve_milestone: "Hito aprobado: el adelanto se pagó al productor.",
    resolve_dispute: "Disputa resuelta.",
    declare_default: "Campaña declarada incumplida: se habilitaron los reembolsos.",
    withdraw_bond: "Tu aval volvió a tu cuenta.",
    settle: "Campaña liquidada.",
  };
  return messages[a.id];
}

// ------------------------------------------------------------------ contract arguments

/** What the user typed in the action's form (see Action.input). */
export interface ActionValues {
  units?: number;
  /** Recipient (transfer), buyer (deliver), or buyer for the manual finalize / resolve fallbacks. */
  address?: string;
  stars?: number;
  amount?: bigint;
  evidence?: string;
  /** resolve_dispute: true = the delivery happened (pay the seller). */
  verdict?: boolean;
}

/** Contract call arguments for `action`, signed by `me`. Names match contracts/despensa/src/lib.rs. */
export function argsFor(action: Action, campaignId: bigint, me: string, v: ActionValues = {}): Record<string, unknown> {
  const id = campaignId;
  switch (action.method) {
    case "buy":
      return { id, buyer: me, units: v.units };
    case "transfer_units":
      return { id, from: me, to: v.address, units: v.units };
    case "confirm_delivery":
      return { id, buyer: me, units: v.units };
    case "dispute":
    case "claim_refund":
      return { id, buyer: me };
    case "finalize_delivery":
      return { id, buyer: action.buyer ?? v.address ?? me };
    case "rate":
      return { id, buyer: me, stars: v.stars };
    case "add_bond":
      return { id, provider: me, amount: v.amount };
    case "withdraw_bond":
      return { id, provider: me };
    case "close_sale":
    case "cancel":
    case "declare_default":
    case "settle":
      return { id };
    case "submit_milestone":
      return { id, index: action.milestoneIndex, evidence: v.evidence };
    case "approve_milestone":
      return { id, index: action.milestoneIndex };
    case "mark_delivered":
      return { id, buyer: v.address, units: v.units };
    case "resolve_dispute":
      return { id, buyer: action.buyer ?? v.address, delivered: v.verdict };
    case null:
      throw new Error(`La acción ${action.id} no llama al contrato.`);
  }
}

// ------------------------------------------------------------------ builders

function transferAction(role: Role, held: number, voucher: string): Action {
  return {
    id: "transfer",
    role,
    method: "transfer_units",
    label: `Regalar ${voucher}s`,
    description: `Pasa tus ${voucher}s a otra persona (por ejemplo, a tu familia). Esa persona recibe la entrega en tu lugar.`,
    input: "units_and_address",
    maxUnits: held,
    confirm: `Tus ${voucher}s pasan a la otra dirección y no vuelven a ti.`,
    irreversible: true,
    tone: "default",
  };
}

function rateAction(role: Role): Action {
  return {
    id: "rate",
    role,
    method: "rate",
    label: "Calificar al productor",
    description: "Tu calificación (1 a 5 estrellas) queda en su reputación. Solo una vez.",
    input: "stars",
    tone: "primary",
  };
}

function refundAction(role: Role, description: string): Action {
  return {
    id: "claim_refund",
    role,
    method: "claim_refund",
    label: "Pedir reembolso",
    description,
    tone: "primary",
  };
}

function bondAction(role: Role, description: string): Action {
  return {
    id: "add_bond",
    role,
    method: "add_bond",
    label: role === "seller" ? "Poner aval" : "Avalar al productor",
    description,
    input: "amount",
    confirm: "El monto queda bloqueado hasta que termine la campaña. Si el productor incumple, se usa para reembolsar.",
    tone: "default",
  };
}

/** withdraw_bond for a guarantor or a seller who posted their own bond; null when nothing comes back. */
function withdrawAction(role: Role, c: Campaign, bond: bigint): Action | null {
  if (withdrawableBond(c, bond) <= BigInt(0)) return null;
  const defaulted = c.status.tag === "Defaulted";
  const partial = defaulted && c.bond_slashed > BigInt(0);
  return {
    id: "withdraw_bond",
    role,
    method: "withdraw_bond",
    label: partial ? "Retirar lo que queda de mi aval" : "Retirar mi aval",
    description: partial
      ? "Parte del aval se usó para reembolsar a los compradores; recuperas el resto."
      : defaulted
        ? "Los reembolsos se cubrieron sin usar el aval: recuperas el 100%."
        : "La campaña terminó sin incumplimiento: recuperas el 100% de tu aval.",
    tone: "primary",
  };
}

/** The pending deliveries the caller loaded, and how many pending units they don't account for. */
function deliveryView(c: Campaign, ctx: ActionContext) {
  const known = (ctx.deliveries ?? []).filter((d) => d.holding.pending > 0);
  const knownPending = known.reduce((sum, d) => sum + d.holding.pending, 0);
  return { known, unexplained: Math.max(0, c.pending - knownPending) };
}

function short(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

/** Max shortfall across milestones that already have evidence and await approval. */
function bondShortfall(c: Campaign): bigint {
  let worst = BigInt(0);
  for (const { i } of pendingMilestones(c)) {
    const gap = requiredBondFor(c, i) - c.bond_total;
    if (gap > worst) worst = gap;
  }
  return worst;
}

/**
 * Disabled actions go last. The first enabled action is the primary CTA; everything else that
 * claimed "primary" is demoted (danger stays danger). A disabled action is never primary.
 */
function normalize(actions: Action[]): Action[] {
  const ordered = [...actions.filter((a) => !a.disabled), ...actions.filter((a) => a.disabled)];
  return ordered.map((a, i) => {
    if (a.tone === "danger") return a;
    if (i === 0 && !a.disabled) return { ...a, tone: "primary" };
    return a.tone === "primary" ? { ...a, tone: "default" } : a;
  });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
