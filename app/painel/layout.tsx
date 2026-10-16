import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Painel do catálogo — CMR Marcenaria",
  robots: { index: false, follow: false },
};

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
