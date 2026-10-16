import { getSupabase, supabaseConfigurado, SUPABASE_URL } from "./supabase";

export type Status = "disponivel" | "reservado" | "vendido";

export interface Mesa {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  madeira: string | null;
  comprimento_cm: number;
  largura_cm: number;
  altura_cm: number | null;
  lugares: number | null;
  preco_a_vista: number | null;
  status: Status;
  fotos: string[];
  criado_em: string;
  atualizado_em: string;
}

/** Mesmas faixas de comprimento que a CMR já usa no CRM. */
export const FAIXAS = [
  { categoria: 1, min: 200, max: 225 },
  { categoria: 2, min: 225, max: 270 },
  { categoria: 3, min: 270, max: 325 },
  { categoria: 4, min: 325, max: 370 },
  { categoria: 5, min: 370, max: 430 },
  { categoria: 6, min: 430, max: 600 },
] as const;

export const STATUS_TEXTO: Record<Status, string> = {
  disponivel: "Disponível",
  reservado: "Reservada",
  vendido: "Vendida",
};

export function categoriaDe(comprimentoCm: number): number | null {
  const faixa = FAIXAS.find(
    (f, i) => comprimentoCm >= f.min && (comprimentoCm < f.max || (i === FAIXAS.length - 1 && comprimentoCm <= f.max)),
  );
  return faixa ? faixa.categoria : null;
}

export function faixaTexto(categoria: number): string {
  const f = FAIXAS.find((x) => x.categoria === categoria);
  return f ? `${f.min}–${f.max} cm` : "";
}

const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function medidasTexto(m: Pick<Mesa, "comprimento_cm" | "largura_cm" | "altura_cm">): string {
  const base = `${numero.format(m.comprimento_cm)} x ${numero.format(m.largura_cm)} cm`;
  return m.altura_cm ? `${base} (altura ${numero.format(m.altura_cm)} cm)` : base;
}

export function precoTexto(valor: number | null): string {
  return valor == null ? "Sob consulta" : moeda.format(valor);
}

export function fotoUrl(caminho: string): string {
  if (/^https?:\/\//.test(caminho)) return caminho;
  return `${SUPABASE_URL}/storage/v1/object/public/fotos/${caminho}`;
}

export interface Filtros {
  status?: Status[];
  categoria?: number;
  comprimentoMin?: number;
  comprimentoMax?: number;
  larguraMin?: number;
  larguraMax?: number;
  precoMax?: number;
  lugaresMin?: number;
  busca?: string;
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Usado quando o Supabase ainda não foi configurado, só para visualizar o site. */
const DEMONSTRACAO: Mesa[] = [
  {
    id: "demo-1", codigo: "CMR-001", nome: "Mesa rústica de peroba", descricao: "Tampo maciço com veios aparentes e pés em X.",
    madeira: "Peroba rosa", comprimento_cm: 220, largura_cm: 100, altura_cm: 78, lugares: 8, preco_a_vista: 4800,
    status: "disponivel", fotos: [], criado_em: "", atualizado_em: "",
  },
  {
    id: "demo-2", codigo: "CMR-002", nome: "Mesa de demolição", descricao: "Madeira de demolição com acabamento natural.",
    madeira: "Demolição", comprimento_cm: 300, largura_cm: 110, altura_cm: 78, lugares: 10, preco_a_vista: 7200,
    status: "reservado", fotos: [], criado_em: "", atualizado_em: "",
  },
  {
    id: "demo-3", codigo: "CMR-003", nome: "Mesa tronco inteiro", descricao: "Peça única, tampo de tronco inteiro.",
    madeira: "Pequi", comprimento_cm: 400, largura_cm: 120, altura_cm: 80, lugares: 14, preco_a_vista: null,
    status: "disponivel", fotos: [], criado_em: "", atualizado_em: "",
  },
];

async function todasAsMesas(): Promise<Mesa[]> {
  if (!supabaseConfigurado) return DEMONSTRACAO;
  const { data, error } = await getSupabase().from("mesas").select("*").order("comprimento_cm");
  if (error) throw new Error(`Erro ao ler o catálogo: ${error.message}`);
  return (data ?? []).map((m) => ({
    ...m,
    comprimento_cm: Number(m.comprimento_cm),
    largura_cm: Number(m.largura_cm),
    altura_cm: m.altura_cm == null ? null : Number(m.altura_cm),
    preco_a_vista: m.preco_a_vista == null ? null : Number(m.preco_a_vista),
  })) as Mesa[];
}

export async function listarMesas(f: Filtros = {}): Promise<Mesa[]> {
  const status = f.status ?? ["disponivel", "reservado"];
  const termo = f.busca ? normalizar(f.busca.trim()) : "";
  return (await todasAsMesas()).filter((m) => {
    if (!status.includes(m.status)) return false;
    if (f.categoria && categoriaDe(m.comprimento_cm) !== f.categoria) return false;
    if (f.comprimentoMin != null && m.comprimento_cm < f.comprimentoMin) return false;
    if (f.comprimentoMax != null && m.comprimento_cm > f.comprimentoMax) return false;
    if (f.larguraMin != null && m.largura_cm < f.larguraMin) return false;
    if (f.larguraMax != null && m.largura_cm > f.larguraMax) return false;
    if (f.precoMax != null && (m.preco_a_vista == null || m.preco_a_vista > f.precoMax)) return false;
    if (f.lugaresMin != null && (m.lugares == null || m.lugares < f.lugaresMin)) return false;
    if (termo) {
      const texto = normalizar([m.codigo, m.nome, m.descricao, m.madeira].filter(Boolean).join(" "));
      if (!termo.split(/\s+/).every((p) => texto.includes(p))) return false;
    }
    return true;
  });
}

export async function buscarMesa(codigo: string): Promise<Mesa | null> {
  const alvo = codigo.trim().toUpperCase();
  return (await todasAsMesas()).find((m) => m.codigo.toUpperCase() === alvo) ?? null;
}

export const modoDemonstracao = !supabaseConfigurado;

/** Formato entregue à IA do atendimento: tudo pronto para repassar ao cliente. */
export function mesaPublica(m: Mesa, site: string) {
  const categoria = categoriaDe(m.comprimento_cm);
  return {
    codigo: m.codigo,
    nome: m.nome,
    descricao: m.descricao,
    madeira: m.madeira,
    status: m.status,
    disponivel: m.status === "disponivel",
    categoria,
    faixa_comprimento: categoria ? faixaTexto(categoria) : null,
    comprimento_cm: m.comprimento_cm,
    largura_cm: m.largura_cm,
    altura_cm: m.altura_cm,
    medidas: medidasTexto(m),
    lugares: m.lugares,
    preco_a_vista: m.preco_a_vista,
    preco_texto: precoTexto(m.preco_a_vista),
    fotos: m.fotos.map(fotoUrl),
    link: `${site}/mesa/${encodeURIComponent(m.codigo)}`,
  };
}
