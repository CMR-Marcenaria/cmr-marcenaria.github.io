import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMR Marcenaria — Catálogo de Mesas Rústicas",
  description: "Mesas rústicas de madeira maciça feitas pela CMR Marcenaria. Veja medidas, fotos e valores das peças disponíveis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <div className="topo-dentro">
            <Link href="/" className="marca">
              <span className="marca-nome">CMR Marcenaria</span>
              <span className="marca-sub">Mesas rústicas em madeira maciça</span>
            </Link>
          </div>
        </header>
        <main className="conteudo">{children}</main>
        <footer className="rodape">CMR Marcenaria · Peças únicas, feitas à mão</footer>
      </body>
    </html>
  );
}
