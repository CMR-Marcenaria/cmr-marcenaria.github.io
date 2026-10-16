import { categoriaDe, listarMesas, medidasTexto, mesaPublica, precoTexto } from "@/lib/mesas";
import { enderecoDoSite } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * O catálogo em texto simples, para IAs que só conseguem ler uma página.
 * Sempre reflete o estado atual: mesas vendidas não aparecem.
 */
export async function GET(req: Request) {
  const site = await enderecoDoSite(req);
  const mesas = await listarMesas({ status: ["disponivel"] });
  const agora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());

  const linhas = [
    "CATÁLOGO CMR MARCENARIA — MESAS RÚSTICAS DISPONÍVEIS",
    `Atualizado em ${agora}. Total disponível: ${mesas.length}.`,
    "Valores à vista. Só estão listadas mesas prontas e disponíveis para venda.",
    "Ao responder o cliente, envie o nome, as medidas, o valor e o link da mesa.",
    "",
  ];
  for (const m of mesas) {
    const p = mesaPublica(m, site);
    const cat = categoriaDe(m.comprimento_cm);
    linhas.push(
      `[${m.codigo}] ${m.nome}`,
      `  Medidas: ${medidasTexto(m)}${cat ? ` · Categoria ${cat}` : ""}${m.lugares ? ` · ${m.lugares} lugares` : ""}`,
      ...(m.madeira ? [`  Madeira: ${m.madeira}`] : []),
      ...(m.descricao ? [`  Descrição: ${m.descricao}`] : []),
      `  Valor à vista: ${precoTexto(m.preco_a_vista)}`,
      `  Link: ${p.link}`,
      ...(p.fotos[0] ? [`  Foto: ${p.fotos[0]}`] : []),
      "",
    );
  }
  if (mesas.length === 0) linhas.push("Nenhuma mesa pronta no momento. A CMR faz mesas sob medida.");

  return new Response(linhas.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });
}
