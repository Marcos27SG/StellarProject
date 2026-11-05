import type { Metadata } from "next";

// `absolute` keeps "Productores · Pacta" here; `template` keeps the suffix on child pages (wizard, delivery).
export const metadata: Metadata = { title: { absolute: "Productores · Pacta", template: "%s · Pacta" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
