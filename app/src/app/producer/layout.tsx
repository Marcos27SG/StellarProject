import type { Metadata } from "next";

// `absolute` keeps "Productores · Ayni" here; `template` keeps the suffix on child pages (wizard, delivery).
export const metadata: Metadata = { title: { absolute: "Productores · Ayni", template: "%s · Ayni" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
