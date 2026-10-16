import { CORS, enderecoDoSite } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Descrição da API no padrão OpenAPI, para cadastrar como "ferramenta" em sistemas de IA. */
export async function GET(req: Request) {
  const site = await enderecoDoSite(req);
  const mesa = {
    type: "object",
    properties: {
      codigo: { type: "string", example: "CMR-001" },
      nome: { type: "string" },
      descricao: { type: ["string", "null"] },
      madeira: { type: ["string", "null"] },
      status: { type: "string", enum: ["disponivel", "reservado", "vendido"] },
      disponivel: { type: "boolean" },
      categoria: { type: ["integer", "null"], description: "Categoria de 1 a 6 pela faixa de comprimento." },
      faixa_comprimento: { type: ["string", "null"] },
      comprimento_cm: { type: "number" },
      largura_cm: { type: "number" },
      altura_cm: { type: ["number", "null"] },
      medidas: { type: "string", example: "220 x 100 cm (altura 78 cm)" },
      lugares: { type: ["integer", "null"] },
      preco_a_vista: { type: ["number", "null"], description: "Valor à vista em reais. Nulo = sob consulta." },
      preco_texto: { type: "string", example: "R$ 4.800,00" },
      fotos: { type: "array", items: { type: "string", format: "uri" } },
      link: { type: "string", format: "uri", description: "Página da mesa para enviar ao cliente." },
    },
  };
  const numero = (description: string) => ({ in: "query", required: false, schema: { type: "number" }, description });

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Catálogo CMR Marcenaria",
      version: "1.0.0",
      description:
        "Consulta as mesas rústicas da CMR Marcenaria: disponibilidade, medidas, fotos e valor à vista. " +
        "Use para responder clientes com o modelo, o valor e o link da mesa.",
    },
    servers: [{ url: site }],
    paths: {
      "/api/mesas": {
        get: {
          operationId: "listarMesas",
          summary: "Lista as mesas do catálogo (por padrão, só as disponíveis)",
          parameters: [
            { in: "query", name: "status", required: false, schema: { type: "string", enum: ["disponivel", "reservado", "vendido", "todos"] }, description: "Padrão: disponivel." },
            { in: "query", name: "categoria", required: false, schema: { type: "integer", minimum: 1, maximum: 6 }, description: "1: 200–225cm, 2: 225–270cm, 3: 270–325cm, 4: 325–370cm, 5: 370–430cm, 6: 430–600cm." },
            { name: "comprimento_min", ...numero("Comprimento mínimo em cm.") },
            { name: "comprimento_max", ...numero("Comprimento máximo em cm.") },
            { name: "largura_min", ...numero("Largura mínima em cm.") },
            { name: "largura_max", ...numero("Largura máxima em cm.") },
            { name: "preco_max", ...numero("Valor à vista máximo em reais.") },
            { name: "lugares_min", ...numero("Quantidade mínima de lugares.") },
            { in: "query", name: "busca", required: false, schema: { type: "string" }, description: "Texto livre: nome, madeira ou código." },
          ],
          responses: {
            "200": {
              description: "Mesas encontradas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      catalogo: { type: "string", format: "uri" },
                      observacao: { type: "string" },
                      mesas: { type: "array", items: mesa },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/mesas/{codigo}": {
        get: {
          operationId: "consultarMesa",
          summary: "Confere uma mesa pelo código, incluindo se já foi vendida",
          parameters: [{ in: "path", name: "codigo", required: true, schema: { type: "string" }, description: "Ex.: CMR-001" }],
          responses: {
            "200": { description: "Mesa encontrada", content: { "application/json": { schema: mesa } } },
            "404": { description: "Código inexistente" },
          },
        },
      },
    },
  };
  return Response.json(spec, { headers: CORS });
}
