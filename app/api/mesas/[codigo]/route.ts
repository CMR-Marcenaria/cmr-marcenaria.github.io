import { buscarMesa, mesaPublica } from "@/lib/mesas";
import { CORS, enderecoDoSite } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Confere uma mesa pelo código (ex.: /api/mesas/CMR-001), inclusive se já foi vendida. */
export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  try {
    const mesa = await buscarMesa(decodeURIComponent(codigo));
    if (!mesa) {
      return Response.json({ erro: `Mesa ${codigo} não encontrada no catálogo.` }, { status: 404, headers: CORS });
    }
    return Response.json(mesaPublica(mesa, await enderecoDoSite(req)), { headers: CORS });
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 500, headers: CORS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
