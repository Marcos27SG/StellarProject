"use client";

import { Info, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useBuyerAttention, useVerifierAllowed } from "@/lib/hooks";
import { Logo } from "./Logo";
import { READ_ONLY_ID, READ_ONLY_REASON, WalletButton, useWallet } from "./Wallet";

type NavItem = { href: string; label: string; match?: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Mercado", match: (p) => p === "/" || p.startsWith("/campaign") },
  { href: "/me", label: "Mis vales" },
  { href: "/producer", label: "Vender", match: (p) => p.startsWith("/producer") || p.startsWith("/p/") },
];
// Only people the contract allows to verify see the inbox.
const VERIFY: NavItem = { href: "/verify", label: "Verificar" };

const isOn = (n: NavItem, path: string) => (n.match ? n.match(path) : path.startsWith(n.href));

export function SiteHeader() {
  const path = usePathname();
  const { enabled, address } = useWallet();
  const attention = useBuyerAttention(address);
  const verifier = useVerifierAllowed(address);
  const nav = verifier.data || path.startsWith("/verify") ? [...NAV, VERIFY] : NAV;
  const badge = (href: string) => (href === "/me" && attention > 0 ? attention : 0);
  // The menu is tied to the path it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg print:hidden">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3" aria-label="Principal">
          <Link href="/" aria-label="Pacta, inicio" className="rounded-md">
            <Logo />
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <ul className="hidden items-center gap-1 md:flex">
              {nav.map((n) => (
                <li key={n.href}>
                  <NavLink href={n.href} on={isOn(n, path)} badge={badge(n.href)}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <WalletButton />
            <button
              type="button"
              className="relative ml-1 inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-2 md:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Cerrar menú" : attention > 0 ? `Abrir menú, ${attention} por atender` : "Abrir menú"}
              onClick={() => setOpenOn(open ? null : path)}
            >
              {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              {!open && attention > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-accent ring-2 ring-bg" aria-hidden />}
            </button>
          </div>
        </nav>
        {open && (
          <ul id="mobile-nav" className="mx-auto grid max-w-6xl gap-1 border-t border-line px-4 py-3 md:hidden">
            {nav.map((n) => (
              <li key={n.href}>
                <NavLink href={n.href} on={isOn(n, path)} block badge={badge(n.href)}>
                  {n.label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink href="/transparencia" on={path.startsWith("/transparencia")} block>
                Transparencia
              </NavLink>
            </li>
          </ul>
        )}
      </header>
      {!enabled && (
        <div className="border-b border-line bg-surface-2 print:hidden">
          <p id={READ_ONLY_ID} className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2.5 text-sm text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {READ_ONLY_REASON}
          </p>
        </div>
      )}
    </>
  );
}

function NavLink({
  href,
  on,
  block,
  badge = 0,
  children,
}: {
  href: string;
  on: boolean;
  block?: boolean;
  /** Count of things waiting for the user there. */
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`inline-flex min-h-10 items-center rounded-full px-3 ${block ? "flex min-h-11 w-full rounded-md" : ""} ${
        on ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-xs font-semibold text-bg">
          {badge}
          <span className="sr-only"> por atender</span>
        </span>
      )}
    </Link>
  );
}
