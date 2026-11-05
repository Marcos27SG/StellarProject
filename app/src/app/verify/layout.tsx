import type { Metadata } from "next";

export const metadata: Metadata = { title: "Panel del verificador" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
