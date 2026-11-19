"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * "Sin señal" (board 05). Shown while the browser reports no connection, with how long it has been
 * offline, so people know what they see may be out of date. The app has no offline cache: the board's
 * "tu vale y QR funcionan sin internet" isn't true here, so it isn't said.
 */
export function OfflineNotice() {
  const [since, setSince] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const off = () => setSince((s) => s ?? Date.now());
    const on = () => setSince(null);
    if (!navigator.onLine) off();
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);

  // Refresh the "hace X min" text every 30 s while offline.
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [since]);

  if (since === null) return null;
  const min = Math.floor((Date.now() - since) / 60_000);
  const ago = min < 1 ? "hace menos de un minuto" : min === 1 ? "hace 1 min" : `hace ${min} min`;
  return (
    <div className="border-b border-line bg-warning-soft print:hidden" role="status">
      <p className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-2.5 text-ink">
        <WifiOff className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <span>
          <b className="font-bold">Sin señal</b> desde {ago}. Lo que ves puede estar desactualizado; no se moverá dinero hasta que vuelva la conexión.
        </span>
      </p>
    </div>
  );
}
