"use client";

import { ChevronRight, House, Info, Scale, Store, Ticket, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useBuyerAttention, useVerifierAllowed } from "@/lib/hooks";
import { Logo } from "./Logo";
import { OfflineNotice } from "./Offline";
import { Dialog } from "./ui";
import { AccountPanel, READ_ONLY_ID, READ_ONLY_REASON, WalletButton, useWallet } from "./Wallet";

// Navigation (design board 06's interface icons): a bottom tab bar on phones (Inicio · Mis vales ·
// Mi puesto · Cuenta) and the same places in the header from 768 px. "Avisos" is left out: the app
// has no notifications.

type NavItem = { href: string; label: string; icon: LucideIcon; match?: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Inicio", icon: House, match: (p) => p === "/" || p.startsWith("/campaign") },
  { href: "/me", label: "Mis vales", icon: Ticket },
  { href: "/producer", label: "Mi puesto", icon: Store, match: (p) => p.startsWith("/producer") },
];
// Only people the contract allows to verify see the inbox.
const VERIFY: NavItem = { href: "/verify", label: "Verificar", icon: Scale };

const isOn = (n: NavItem, path: string) => (n.match ? n.match(path) : path.startsWith(n.href));

/**
 * Where the tab bar steps aside: the campaign page has its own fixed "Reservar" bar, the delivery
 * hand-off needs the whole screen, and the poster is for printing.
 */
const hideTabs = (path: string) => path.startsWith("/campaign") || path.startsWith("/producer/deliver");

export function SiteHeader() {
  const path = usePathname();
  const { enabled, address } = useWallet();
  const attention = useBuyerAttention(address);
  const verifier = useVerifierAllowed(address);
  const nav = verifier.data || path.startsWith("/verify") ? [...NAV, VERIFY] : NAV;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg print:hidden">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5" aria-label="Principal">
          <Link href="/" aria-label="Ayni, inicio" className="rounded-md">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <ul className="hidden items-center gap-1 md:flex">
              {nav.map((n) => (
                <li key={n.href}>
                  <TopLink item={n} on={isOn(n, path)} badge={n.href === "/me" ? attention : 0} />
                </li>
              ))}
            </ul>
            <span className="md:ml-2">
              <WalletButton />
            </span>
          </div>
        </nav>
      </header>
      {!enabled && (
        <div className="border-b border-line bg-info-soft print:hidden">
          <p id={READ_ONLY_ID} className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-2.5 text-ink">
            <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
            {READ_ONLY_REASON}
          </p>
        </div>
      )}
      <OfflineNotice />
    </>
  );
}

function TopLink({ item, on, badge }: { item: NavItem; on: boolean; badge: number }) {
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[0.9375rem] font-bold ${on ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
    >
      {item.label}
      <Badge n={badge} />
    </Link>
  );
}

/** A count of things waiting for the user (deliveries to confirm, refunds to claim). Ink, not amber: it's small text. */
function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-xs leading-5 font-bold text-bg tabular-nums">
      {n}
      <span className="sr-only"> por atender</span>
    </span>
  );
}

/**
 * The phone tab bar (elevation 2). It sets --bottom-bar so toasts and the footer clear it, and hides
 * itself where a screen needs the bottom edge (hideTabs).
 */
export function BottomTabs() {
  const path = usePathname();
  const { address } = useWallet();
  const attention = useBuyerAttention(address);
  const [account, setAccount] = useState(false);
  const hidden = hideTabs(path);

  useEffect(() => {
    const root = document.documentElement;
    const narrow = window.matchMedia("(max-width: 767px)");
    const apply = () => root.style.setProperty("--bottom-bar", !hidden && narrow.matches ? "64px" : "0px");
    apply();
    narrow.addEventListener("change", apply);
    return () => narrow.removeEventListener("change", apply);
  }, [hidden]);

  if (hidden) return null;
  const tab = "relative flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold";
  return (
    <>
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-fixed pb-[env(safe-area-inset-bottom)] shadow-fixed md:hidden print:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {NAV.map((n) => {
            const on = isOn(n, path);
            const Icon = n.icon;
            const count = n.href === "/me" ? attention : 0;
            return (
              <li key={n.href} className="flex flex-1">
                <Link href={n.href} aria-current={on ? "page" : undefined} className={`${tab} ${on ? "text-brand" : "text-ink-2"}`}>
                  <span className="relative">
                    <Icon className="size-6" strokeWidth={on ? 2.4 : 2} aria-hidden />
                    {count > 0 && <span className="absolute -top-1 -right-1.5 size-2.5 rounded-full bg-accent ring-2 ring-surface-fixed" aria-hidden />}
                  </span>
                  {n.label}
                  {count > 0 && <span className="sr-only">, {count} por atender</span>}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" className={`${tab} ${account ? "text-brand" : "text-ink-2"}`} aria-haspopup="dialog" onClick={() => setAccount(true)}>
              <User className="size-6" aria-hidden />
              Cuenta
            </button>
          </li>
        </ul>
      </nav>
      <AccountSheet open={account} onClose={() => setAccount(false)} />
    </>
  );
}

/** "Cuenta" on phones: the account, or how to sign in, plus the places that don't fit in the tabs. */
function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enabled, address, connect } = useWallet();
  const verifier = useVerifierAllowed(address);
  const links = [
    ...(verifier.data ? [{ href: "/verify", label: "Verificar entregas e hitos" }] : []),
    ...(address ? [{ href: `/p/${address}`, label: "Mi perfil público" }] : []),
    { href: "/transparencia", label: "Transparencia: el contrato en vivo" },
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Cuenta">
      <div className="space-y-5">
        {address ? (
          <AccountPanel onNavigate={onClose} />
        ) : enabled ? (
          <div className="space-y-3">
            <p className="text-ink-2">Entra con tu cuenta de Google para reservar, ver tus vales y vender. No necesitas instalar nada.</p>
            <button
              type="button"
              className="btn btn-lg w-full"
              onClick={() => {
                onClose();
                connect();
              }}
            >
              Entrar con Google
            </button>
          </div>
        ) : (
          <p className="text-ink-2">{READ_ONLY_REASON}</p>
        )}
        <ul className="divide-y divide-line border-y border-line">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={onClose} className="flex min-h-12 items-center justify-between gap-3 font-bold text-ink">
                {l.label}
                <ChevronRight className="size-5 text-ink-2" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
