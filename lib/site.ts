import { headers } from "next/headers";

/** Libera a API para ser chamada de qualquer sistema (somente leitura). */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

/** Endereço público do site, para montar links completos de mesas e fotos. */
export async function enderecoDoSite(req?: Request): Promise<string> {
  const fixo = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixo) return fixo.replace(/\/+$/, "");
  if (req) return new URL(req.url).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function linkWhatsApp(mensagem: string): string | null {
  const numero = (process.env.NEXT_PUBLIC_WHATSAPP ?? "").replace(/\D/g, "");
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
