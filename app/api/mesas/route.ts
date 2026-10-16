import { listarMesas, mesaPublica, type Filtros, type Status } from "@/lib/mesas";
import { CORS, enderecoDoSite } from "@/lib/site";

export const dynamic = "force-dynamic";

function num(valor: string | null): number | undefined {
  if (valor == null || valor.trim() === "") return undefined;
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function statusPedido(valor: string | null): Status[] {
  if (!valor || valor === "disponivel") return ["disponivel"];
  if (valor === "todos") return ["disponivel", "reservado", "vendido"];
  const lista = valor.split(",").filter((s): s is Status => ["disponivel", "reservado", "vendido"].includes(s));
  return lista.length ? lista : ["disponivel"];
}

/**
 * Lista as mesas do catálogo. Por padrão só as disponíveis para venda.
 * Exemplo: /api/mesas?comprimento_min=250&comprimento_max=320&preco_max=8000
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const filtros: Filtros = {
    status: statusPedido(p.get("status")),
    categoria: num(p.get("categoria")),
    comprimentoMin: num(p.get("comprimento_min")),
    comprimentoMax: num(p.get("comprimento_max")),
    larguraMin: num(p.get("largura_min")),
    larguraMax: num(p.get("largura_max")),
    precoMax: num(p.get("preco_max")),
    lugaresMin: num(p.get("lugares_min")),
    busca: p.get("busca") ?? undefined,
  };
  try {
    const site = await enderecoDoSite(req);
    const mesas = (await listarMesas(filtros)).map((m) => mesaPublica(m, site));
    return Response.json(
      {
        total: mesas.length,
        catalogo: site,
        observacao: mesas.length === 0
          ? "Nenhuma mesa pronta com esses critérios. A CMR também faz mesas sob medida."
          : "Valores à vista. Mesas com status 'reservado' não estão disponíveis para venda.",
        mesas,
      },
      { headers: CORS },
    );
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 500, headers: CORS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
