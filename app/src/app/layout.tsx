import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "@pollar/react/styles.css";
import "./globals.css";
import { PactaMark } from "@/components/Logo";
import { SiteHeader } from "@/components/SiteHeader";
import { Providers } from "@/components/Wallet";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["SOFT", "opsz"] });

const DESCRIPTION =
  "Preventa de productos locales a precio fijo. Tu dinero queda protegido en Stellar hasta que recibes tu producto.";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Pacta",
  title: { default: "Pacta · No es una promesa. Es un pacto.", template: "%s · Pacta" },
  description: DESCRIPTION,
  openGraph: { siteName: "Pacta", type: "website", locale: "es_BO", title: "Pacta", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Pacta", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    // Browser chrome color: mirrors --bg in globals.css (metadata can't read CSS variables).
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#14120f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}>
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10 print:max-w-none print:p-0">{children}</main>
          <footer className="mx-auto mt-8 max-w-6xl border-t border-line px-4 pt-6 pb-28 text-sm text-ink-2 lg:pb-10 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <p className="flex items-center gap-2">
                <PactaMark className="size-5" />
                <span>
                  <b className="font-semibold text-ink">Pacta.</b> No es una promesa. Es un pacto.
                </span>
              </p>
              <Link href="/transparencia" className="link">
                Transparencia: el contrato en vivo
              </Link>
            </div>
            <p className="mt-3">Stellar testnet · Hackathon Stellar Bolivia 2026 · Los montos son de prueba.</p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
