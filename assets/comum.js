// Funções usadas pelo catálogo público e pelo painel.

/** Mesmas faixas de comprimento que a CMR já usa no CRM. */
const FAIXAS = [
  { categoria: 1, min: 200, max: 225 },
  { categoria: 2, min: 225, max: 270 },
  { categoria: 3, min: 270, max: 325 },
  { categoria: 4, min: 325, max: 370 },
  { categoria: 5, min: 370, max: 430 },
  { categoria: 6, min: 430, max: 600 },
];

const STATUS_TEXTO = { disponivel: "Disponível", reservado: "Reservada", vendido: "Vendida" };

function categoriaDe(comprimento) {
  const i = FAIXAS.findIndex((f, i) => comprimento >= f.min && (comprimento < f.max || (i === FAIXAS.length - 1 && comprimento <= f.max)));
  return i >= 0 ? FAIXAS[i].categoria : null;
}

function faixaTexto(categoria) {
  const f = FAIXAS.find((x) => x.categoria === categoria);
  return f ? `${f.min}–${f.max} cm` : "";
}

const fmtNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function medidasTexto(m) {
  const base = `${fmtNumero.format(m.comprimento_cm)} x ${fmtNumero.format(m.largura_cm)} cm`;
  return m.altura_cm ? `${base} (altura ${fmtNumero.format(m.altura_cm)} cm)` : base;
}

function precoTexto(valor) {
  return valor == null ? "Sob consulta" : fmtMoeda.format(valor).replace(/ /g, " ");
}

/** Escapa texto antes de colocar no HTML. */
function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Lê o catálogo sempre fresco (sem cache do navegador). */
async function carregarCatalogo() {
  const r = await fetch(`dados/mesas.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("Não foi possível carregar o catálogo.");
  return r.json();
}

function linkWhatsApp(numero, mensagem) {
  const n = String(numero || "").replace(/\D/g, "");
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}` : null;
}
