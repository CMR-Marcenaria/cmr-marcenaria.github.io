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

/** Endereço do site atual (ex.: https://cmr-marcenaria.github.io), usado nos links compartilhados. */
function siteAtual() {
  return (location.origin + location.pathname.replace(/[^/]*$/, "")).replace(/\/+$/, "");
}

/** Nome do arquivo da página curta da mesa: "105" → m/105.html, link /m/105 */
function slugCodigo(codigo) {
  return String(codigo).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "mesa";
}

function linkDaMesa(m, site) {
  return `${site}/m/${slugCodigo(m.codigo)}`;
}

/** Mensagem pronta que o cliente envia para a CMR pelo WhatsApp. */
function mensagemInteresse(m, site) {
  return [
    "Olá, CMR Marcenaria! Tenho interesse nesta peça do catálogo:",
    "",
    `*${m.nome}* (nº ${m.codigo})`,
    `Medidas: ${medidasTexto(m)}`,
    ...(m.lugares ? [`Lugares: ${m.lugares}`] : []),
    ...(m.madeira ? [`Madeira: ${m.madeira}`] : []),
    `Valor à vista: ${precoTexto(m.preco_a_vista)}`,
    "",
    linkDaMesa(m, site),
    "",
    "Ela ainda está disponível?",
  ].join("\n");
}

/** Compartilha o link da mesa (menu do celular) ou copia para a área de transferência. */
async function compartilharMesa(m, site, botao) {
  const url = linkDaMesa(m, site);
  const texto = `${m.nome} · ${medidasTexto(m)} · ${precoTexto(m.preco_a_vista)} à vista`;
  try {
    if (navigator.share) { await navigator.share({ title: `${m.nome} — CMR Marcenaria`, text: texto, url }); return; }
    await navigator.clipboard.writeText(url);
  } catch (e) {
    if (e && e.name === "AbortError") return; // a pessoa fechou o menu de compartilhar
    window.prompt("Copie o link da mesa:", url);
    return;
  }
  if (botao) {
    const original = botao.textContent;
    botao.textContent = "Link copiado!";
    setTimeout(() => { botao.textContent = original; }, 2000);
  }
}

/**
 * Página curta de cada mesa (m/105.html). Só existe para o link ficar bonito e para o
 * WhatsApp mostrar foto, nome e preço na prévia; quem abre é levado para mesa.html.
 */
function paginaDaMesa(m, site) {
  const destino = `../mesa.html?c=${encodeURIComponent(m.codigo)}`;
  const titulo = `${m.nome} (nº ${m.codigo}) — CMR Marcenaria`;
  const descricao = `${medidasTexto(m)}${m.lugares ? ` · ${m.lugares} lugares` : ""} · ${precoTexto(m.preco_a_vista)} à vista`;
  const imagem = m.fotos[0] ? `${site}/${m.fotos[0]}` : `${site}/assets/logo.jpg`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(descricao)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="CMR Marcenaria">
  <meta property="og:title" content="${esc(titulo)}">
  <meta property="og:description" content="${esc(descricao)}">
  <meta property="og:image" content="${esc(imagem)}">
  <meta property="og:url" content="${esc(linkDaMesa(m, site))}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${esc(linkDaMesa(m, site))}">
  <meta http-equiv="refresh" content="0; url=${esc(destino)}">
</head>
<body>
  <script>location.replace(${JSON.stringify(destino)});</script>
  <a href="${esc(destino)}">Ver a mesa ${esc(m.nome)}</a>
</body>
</html>
`;
}

/** Arquivos públicos gerados a cada alteração: JSON (site e IA), texto para a IA e páginas das mesas. */
function gerarArquivosPublicos(estado, site) {
  const mesas = estado.mesas.map((m) => {
    const categoria = categoriaDe(m.comprimento_cm);
    return {
      ...m,
      disponivel: m.status === "disponivel",
      categoria,
      faixa_comprimento: categoria ? faixaTexto(categoria) : null,
      medidas: medidasTexto(m),
      preco_texto: precoTexto(m.preco_a_vista),
      link: linkDaMesa(m, site),
      fotos_url: m.fotos.map((f) => `${site}/${f}`),
    };
  }).sort((a, b) => a.comprimento_cm - b.comprimento_cm);

  const agora = new Date();
  const json = {
    loja: estado.loja,
    site,
    atualizado_em: agora.toISOString(),
    observacao: "Valores à vista. Só mesas com status 'disponivel' podem ser vendidas; 'reservado' e 'vendido' não estão disponíveis.",
    total_disponiveis: mesas.filter((m) => m.disponivel).length,
    mesas,
  };

  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(agora);
  const disponiveis = mesas.filter((m) => m.disponivel);
  const whats = String((estado.loja && estado.loja.whatsapp) || "").replace(/\D/g, "");
  const linhas = [
    "CATÁLOGO CMR MARCENARIA — MESAS RÚSTICAS DISPONÍVEIS",
    `Atualizado em ${quando}. Total disponível: ${disponiveis.length}.`,
    "Valores à vista. Só estão listadas mesas prontas e disponíveis para venda.",
    "Ao responder o cliente, envie o nome, as medidas, o valor e o link da mesa.",
    ...(whats ? [`WhatsApp da CMR para fechar a compra: +${whats}`] : []),
    "",
  ];
  for (const m of disponiveis) {
    linhas.push(
      `[${m.codigo}] ${m.nome}`,
      `  Medidas: ${m.medidas}${m.categoria ? ` · Categoria ${m.categoria}` : ""}${m.lugares ? ` · ${m.lugares} lugares` : ""}`,
      ...(m.madeira ? [`  Madeira: ${m.madeira}`] : []),
      ...(m.descricao ? [`  Descrição: ${m.descricao.replace(/\s+/g, " ")}`] : []),
      `  Valor à vista: ${m.preco_texto}`,
      `  Link: ${m.link}`,
      ...(m.fotos_url[0] ? [`  Foto: ${m.fotos_url[0]}`] : []),
      "",
    );
  }
  if (disponiveis.length === 0) linhas.push("Nenhuma mesa pronta no momento. A CMR faz mesas sob medida.");

  const arquivos = { "dados/mesas.json": JSON.stringify(json, null, 2) + "\n", "catalogo.txt": linhas.join("\n") + "\n" };
  for (const m of estado.mesas) arquivos[`m/${slugCodigo(m.codigo)}.html`] = paginaDaMesa(m, site);
  return arquivos;
}
