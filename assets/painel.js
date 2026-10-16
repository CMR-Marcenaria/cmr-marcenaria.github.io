// Painel do catálogo: edita as mesas e salva direto no repositório do GitHub.
// Cada "Salvar" vira um commit; o GitHub Pages publica a nova versão em 1–2 minutos.

const API = "https://api.github.com";
const CHAVE_LOCAL = "cmr_painel";
const CAMPOS = ["codigo", "nome", "descricao", "madeira", "comprimento_cm", "largura_cm", "altura_cm", "lugares", "preco_a_vista", "status", "fotos"];

const $ = (id) => document.getElementById(id);
let acesso = { dono: "", nome: "", chave: "", branch: "main" };
let dados = { loja: { nome: "CMR Marcenaria", whatsapp: "" }, mesas: [] };
let filtro = "todas";
let editando = null; // null | "nova" | mesa
let fotosForm = []; // { caminho } já publicada  |  { arquivo, previa } nova
let fotosRemovidas = [];

// ── Utilidades ──────────────────────────────────────────────────────────────

function paraNumero(texto) {
  const t = String(texto ?? "").trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

function guardar(valor, lembrar) {
  try {
    localStorage.removeItem(CHAVE_LOCAL);
    sessionStorage.removeItem(CHAVE_LOCAL);
    if (valor) (lembrar ? localStorage : sessionStorage).setItem(CHAVE_LOCAL, JSON.stringify(valor));
  } catch { /* navegador sem armazenamento: só não lembra */ }
}

function lembrado() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || sessionStorage.getItem(CHAVE_LOCAL) || "null");
  } catch { return null; }
}

/** Descobre usuário e repositório pelo endereço (usuario.github.io/repositorio/painel.html). */
function repoPeloEndereco() {
  if (!location.hostname.endsWith(".github.io")) return null;
  const dono = location.hostname.split(".")[0];
  const primeiro = location.pathname.split("/").filter(Boolean)[0];
  const nome = primeiro && !primeiro.endsWith(".html") ? primeiro : `${dono}.github.io`;
  return { dono, nome };
}

function enderecoPublico() {
  const raiz = `https://${acesso.dono}.github.io`;
  return acesso.nome.toLowerCase() === `${acesso.dono}.github.io`.toLowerCase() ? raiz : `${raiz}/${acesso.nome}`;
}

function textoParaBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ParaTexto(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Não consegui ler a foto."));
    r.readAsDataURL(blob);
  });
}

/** Reduz a foto para no máximo 1600px: foto de celular tem 3–6 MB, assim fica com ~300 KB. */
function reduzirImagem(arquivo, larguraMax = 1600, qualidade = 0.85) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    const desistir = setTimeout(() => resolve(arquivo), 15000);
    img.onload = () => {
      clearTimeout(desistir);
      const escala = Math.min(1, larguraMax / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b || arquivo), "image/jpeg", qualidade);
    };
    img.onerror = () => { clearTimeout(desistir); URL.revokeObjectURL(url); resolve(arquivo); };
    img.src = url;
  });
}

function proximoCodigo() {
  const maior = dados.mesas.reduce((max, m) => {
    const n = Number((/^CMR-(\d+)$/i.exec(m.codigo) || [])[1]);
    return n > max ? n : max;
  }, 0);
  return `CMR-${String(maior + 1).padStart(3, "0")}`;
}

function limpar(m) {
  const base = {};
  for (const c of CAMPOS) base[c] = m[c] ?? (c === "fotos" ? [] : null);
  return base;
}

// ── GitHub ──────────────────────────────────────────────────────────────────

async function gh(caminho, opcoes = {}) {
  const r = await fetch(API + caminho, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${acesso.chave}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    const erro = new Error(
      r.status === 401 ? "Chave de acesso inválida ou vencida." :
      r.status === 403 || r.status === 404 ? "Essa chave não tem acesso ao repositório do catálogo." :
      corpo.message || `Erro ${r.status} no GitHub.`,
    );
    erro.status = r.status;
    throw erro;
  }
  return r.status === 204 ? null : r.json();
}

const repoUrl = () => `/repos/${encodeURIComponent(acesso.dono)}/${encodeURIComponent(acesso.nome)}`;

/** Grava vários arquivos num único commit. Valor null apaga o arquivo. */
async function commitar(mensagem, arquivos) {
  const ref = await gh(`${repoUrl()}/git/ref/heads/${acesso.branch}`);
  const atual = await gh(`${repoUrl()}/git/commits/${ref.object.sha}`);
  const arvore = [];
  for (const [path, conteudo] of Object.entries(arquivos)) {
    if (conteudo === null) {
      arvore.push({ path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await gh(`${repoUrl()}/git/blobs`, {
      method: "POST",
      body: JSON.stringify(typeof conteudo === "string" ? { content: conteudo, encoding: "utf-8" } : { content: conteudo.base64, encoding: "base64" }),
    });
    arvore.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const novaArvore = await gh(`${repoUrl()}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: atual.tree.sha, tree: arvore }) });
  const novo = await gh(`${repoUrl()}/git/commits`, { method: "POST", body: JSON.stringify({ message: mensagem, tree: novaArvore.sha, parents: [ref.object.sha] }) });
  await gh(`${repoUrl()}/git/refs/heads/${acesso.branch}`, { method: "PATCH", body: JSON.stringify({ sha: novo.sha }) });
}

async function lerDados() {
  try {
    const arq = await gh(`${repoUrl()}/contents/dados/mesas.json?ref=${acesso.branch}`);
    const lido = JSON.parse(base64ParaTexto(arq.content));
    dados = { loja: { nome: "CMR Marcenaria", whatsapp: "", ...(lido.loja || {}) }, mesas: (lido.mesas || []).map(limpar) };
  } catch (e) {
    if (e.status !== 404) throw e;
    dados = { loja: { nome: "CMR Marcenaria", whatsapp: "" }, mesas: [] };
  }
}

// ── Arquivos publicados (site + IA) ────────────────────────────────────────

/** Gera o JSON lido pelo site e pela IA, e o catálogo em texto simples. */
function gerarPublicacao(estado) {
  const site = enderecoPublico();
  const mesas = estado.mesas.map((m) => {
    const categoria = categoriaDe(m.comprimento_cm);
    return {
      ...m,
      disponivel: m.status === "disponivel",
      categoria,
      faixa_comprimento: categoria ? faixaTexto(categoria) : null,
      medidas: medidasTexto(m),
      preco_texto: precoTexto(m.preco_a_vista),
      link: `${site}/mesa.html?c=${encodeURIComponent(m.codigo)}`,
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
  const linhas = [
    "CATÁLOGO CMR MARCENARIA — MESAS RÚSTICAS DISPONÍVEIS",
    `Atualizado em ${quando}. Total disponível: ${disponiveis.length}.`,
    "Valores à vista. Só estão listadas mesas prontas e disponíveis para venda.",
    "Ao responder o cliente, envie o nome, as medidas, o valor e o link da mesa.",
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

  return { "dados/mesas.json": JSON.stringify(json, null, 2) + "\n", "catalogo.txt": linhas.join("\n") + "\n" };
}

async function publicar(novoEstado, mensagem, extras = {}) {
  await commitar(mensagem, { ...extras, ...gerarPublicacao(novoEstado) });
  dados = novoEstado;
  avisar("Salvo! O catálogo público atualiza em 1 a 2 minutos.");
}

// ── Telas ───────────────────────────────────────────────────────────────────

function avisar(texto) {
  const a = $("aviso");
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 6000);
}

function erroGeral(texto) { $("erro-geral").textContent = texto || ""; }

function mostrarLista() {
  $("form-mesa").hidden = true;
  $("caixa-config").hidden = true;
  $("area-lista").hidden = false;
  $("btn-nova").hidden = false;
  desenharLista();
}

function desenharLista() {
  const conta = (s) => dados.mesas.filter((m) => m.status === s).length;
  $("filtros-status").innerHTML = [["todas", `Todas (${dados.mesas.length})`], ...["disponivel", "reservado", "vendido"].map((s) => [s, `${STATUS_TEXTO[s]} (${conta(s)})`])]
    .map(([v, t]) => `<button class="chip ${filtro === v ? "ativo" : ""}" data-filtro="${v}">${t}</button>`).join("");

  const visiveis = dados.mesas.filter((m) => filtro === "todas" || m.status === filtro);
  if (visiveis.length === 0) {
    $("lista-admin").innerHTML = `<div class="vazio">Nenhuma mesa aqui ainda. Toque em “+ Nova mesa” para cadastrar.</div>`;
    return;
  }
  $("lista-admin").innerHTML = `<div class="lista-admin">${visiveis.map((m) => {
    const cat = categoriaDe(m.comprimento_cm);
    return `<div class="item-admin ${m.status === "vendido" ? "vendido" : ""}">
      <div class="foto">${m.fotos[0] ? `<img src="${esc(m.fotos[0])}" alt="">` : `<span class="dica">sem foto</span>`}</div>
      <div>
        <div class="codigo">${esc(m.codigo)}${cat ? ` · Cat. ${cat}` : ""} · ${m.fotos.length} foto(s)</div>
        <div class="nome">${esc(m.nome)}</div>
        <div class="medidas">${esc(medidasTexto(m))}</div>
        <div><strong>${precoTexto(m.preco_a_vista)}</strong> <span class="selo selo-${m.status}">${STATUS_TEXTO[m.status]}</span></div>
      </div>
      <div class="acoes">
        <button class="botao pequeno" data-editar="${esc(m.codigo)}">Editar / fotos</button>
        <select data-status="${esc(m.codigo)}" aria-label="Situação">
          ${["disponivel", "reservado", "vendido"].map((s) => `<option value="${s}" ${m.status === s ? "selected" : ""}>${STATUS_TEXTO[s]}</option>`).join("")}
        </select>
        <button class="botao pequeno perigo" data-apagar="${esc(m.codigo)}">Apagar</button>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function abrirFormulario(mesa) {
  editando = mesa || "nova";
  fotosForm = (mesa ? mesa.fotos : []).map((caminho) => ({ caminho }));
  fotosRemovidas = [];
  const f = $("form-mesa");
  f.reset();
  $("form-titulo").textContent = mesa ? `Editar ${mesa.codigo}` : "Nova mesa";
  for (const c of CAMPOS) {
    if (c === "fotos" || !f.elements[c]) continue;
    f.elements[c].value = mesa ? (mesa[c] ?? "") : (c === "status" ? "disponivel" : "");
  }
  f.elements.codigo.placeholder = mesa ? "" : `automático (${proximoCodigo()})`;
  $("form-erro").textContent = "";
  $("form-progresso").textContent = "";
  atualizarCategoria();
  desenharFotosForm();
  $("area-lista").hidden = true;
  $("caixa-config").hidden = true;
  $("btn-nova").hidden = true;
  f.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function atualizarCategoria() {
  const c = paraNumero($("form-mesa").elements.comprimento_cm.value);
  const cat = c ? categoriaDe(c) : null;
  $("form-categoria").textContent = cat ? `Pelo comprimento, esta mesa entra na categoria ${cat} (${faixaTexto(cat)}).` : "";
}

function desenharFotosForm() {
  $("form-fotos").innerHTML = fotosForm.map((f, i) => `
    <div class="mini ${f.arquivo ? "nova" : ""}">
      <img src="${esc(f.previa || f.caminho)}" alt="">
      ${i === 0 ? `<span class="capa">capa</span>` : ""}
      <div class="acoes-foto">
        ${i > 0 ? `<button type="button" data-capa="${i}" title="Usar como capa">capa</button>` : ""}
        <button type="button" data-remover="${i}" title="Remover">✕</button>
      </div>
    </div>`).join("");
}

async function salvarFormulario(e) {
  e.preventDefault();
  const f = $("form-mesa").elements;
  const erro = (t) => { $("form-erro").textContent = t; };
  erro("");

  const comprimento = paraNumero(f.comprimento_cm.value);
  const largura = paraNumero(f.largura_cm.value);
  if (!f.nome.value.trim() || !comprimento || !largura) return erro("Preencha pelo menos nome, comprimento e largura.");

  const anterior = editando === "nova" ? null : editando;
  const codigo = (f.codigo.value.trim() || (anterior ? anterior.codigo : proximoCodigo())).toUpperCase();
  if (dados.mesas.some((m) => m !== anterior && m.codigo.toUpperCase() === codigo)) return erro(`Já existe uma mesa com o código ${codigo}.`);
  const lugares = paraNumero(f.lugares.value);

  const botao = $("btn-salvar");
  botao.disabled = true;
  try {
    const extras = {};
    const fotos = [];
    const novas = fotosForm.filter((x) => x.arquivo).length;
    let n = 0;
    for (const foto of fotosForm) {
      if (foto.caminho) { fotos.push(foto.caminho); continue; }
      $("form-progresso").textContent = `Preparando foto ${++n} de ${novas}…`;
      const caminho = `fotos/${codigo.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      extras[caminho] = { base64: await blobParaBase64(await reduzirImagem(foto.arquivo)) };
      fotos.push(caminho);
    }
    for (const caminho of fotosRemovidas) extras[caminho] = null;

    const mesa = limpar({
      codigo,
      nome: f.nome.value.trim(),
      descricao: f.descricao.value.trim() || null,
      madeira: f.madeira.value.trim() || null,
      comprimento_cm: comprimento,
      largura_cm: largura,
      altura_cm: paraNumero(f.altura_cm.value),
      lugares: lugares == null ? null : Math.round(lugares),
      preco_a_vista: paraNumero(f.preco_a_vista.value),
      status: f.status.value,
      fotos,
    });
    const mesas = anterior ? dados.mesas.map((m) => (m === anterior ? mesa : m)) : [...dados.mesas, mesa];

    $("form-progresso").textContent = "Enviando para o GitHub…";
    await publicar({ ...dados, mesas }, `${anterior ? "Atualiza" : "Cadastra"} mesa ${codigo}`, extras);
    fotosForm.forEach((x) => x.previa && URL.revokeObjectURL(x.previa));
    mostrarLista();
  } catch (err) {
    erro(err.status === 422 || err.status === 409 ? "O catálogo foi alterado em outro aparelho. Recarregue a página e tente de novo." : err.message);
  } finally {
    botao.disabled = false;
    $("form-progresso").textContent = "";
  }
}

async function acaoNaLista(e) {
  const filtroBtn = e.target.closest("[data-filtro]");
  if (filtroBtn) { filtro = filtroBtn.dataset.filtro; desenharLista(); return; }

  const editar = e.target.closest("[data-editar]");
  if (editar) { abrirFormulario(dados.mesas.find((m) => m.codigo === editar.dataset.editar)); return; }

  const apagar = e.target.closest("[data-apagar]");
  if (apagar) {
    const mesa = dados.mesas.find((m) => m.codigo === apagar.dataset.apagar);
    if (!mesa || !confirm(`Apagar a mesa ${mesa.codigo} (${mesa.nome}) e as fotos dela?`)) return;
    erroGeral("");
    try {
      const extras = Object.fromEntries(mesa.fotos.map((c) => [c, null]));
      await publicar({ ...dados, mesas: dados.mesas.filter((m) => m !== mesa) }, `Remove mesa ${mesa.codigo}`, extras);
      desenharLista();
    } catch (err) { erroGeral(err.message); }
  }
}

async function mudarStatus(e) {
  const sel = e.target.closest("[data-status]");
  if (!sel) return;
  const mesa = dados.mesas.find((m) => m.codigo === sel.dataset.status);
  erroGeral("");
  sel.disabled = true;
  try {
    const mesas = dados.mesas.map((m) => (m === mesa ? { ...m, status: sel.value } : m));
    await publicar({ ...dados, mesas }, `Mesa ${mesa.codigo}: ${STATUS_TEXTO[sel.value]}`);
    desenharLista();
  } catch (err) {
    erroGeral(err.message);
    sel.value = mesa.status;
  } finally { sel.disabled = false; }
}

async function entrar(e) {
  if (e) e.preventDefault();
  $("login-erro").textContent = "";
  const doEndereco = repoPeloEndereco();
  acesso.dono = doEndereco ? doEndereco.dono : $("login-dono").value.trim();
  acesso.nome = doEndereco ? doEndereco.nome : $("login-repo").value.trim();
  acesso.chave = $("login-chave").value.trim();
  if (!acesso.dono || !acesso.nome || !acesso.chave) { $("login-erro").textContent = "Preencha todos os campos."; return; }

  $("btn-entrar").disabled = true;
  try {
    const repo = await gh(repoUrl());
    if (!repo.permissions || !repo.permissions.push) throw new Error("Essa chave só pode ler. Crie a chave com permissão de escrita (Contents: Read and write).");
    acesso.branch = repo.default_branch || "main";
    await lerDados();
    guardar({ dono: acesso.dono, nome: acesso.nome, chave: acesso.chave }, $("login-lembrar").checked);
    $("tela-login").hidden = true;
    $("tela-gestao").hidden = false;
    mostrarLista();
  } catch (err) {
    $("login-erro").textContent = err.message;
  } finally {
    $("btn-entrar").disabled = false;
  }
}

// ── Início ──────────────────────────────────────────────────────────────────

$("tela-login").addEventListener("submit", entrar);
$("btn-sair").addEventListener("click", (e) => { e.preventDefault(); guardar(null); location.reload(); });
$("btn-nova").addEventListener("click", () => abrirFormulario(null));
$("btn-cancelar").addEventListener("click", mostrarLista);
$("form-mesa").addEventListener("submit", salvarFormulario);
$("form-mesa").elements.comprimento_cm.addEventListener("input", atualizarCategoria);
$("lista-admin").addEventListener("click", acaoNaLista);
$("filtros-status").addEventListener("click", acaoNaLista);
$("lista-admin").addEventListener("change", mudarStatus);

$("form-arquivos").addEventListener("change", (e) => {
  for (const arquivo of e.target.files) fotosForm.push({ arquivo, previa: URL.createObjectURL(arquivo) });
  e.target.value = "";
  desenharFotosForm();
});

$("form-fotos").addEventListener("click", (e) => {
  const capa = e.target.closest("[data-capa]");
  const remover = e.target.closest("[data-remover]");
  if (capa) {
    const [foto] = fotosForm.splice(Number(capa.dataset.capa), 1);
    fotosForm.unshift(foto);
  } else if (remover) {
    const [foto] = fotosForm.splice(Number(remover.dataset.remover), 1);
    if (foto.caminho) fotosRemovidas.push(foto.caminho);
    if (foto.previa) URL.revokeObjectURL(foto.previa);
  } else return;
  desenharFotosForm();
});

$("btn-config").addEventListener("click", (e) => {
  e.preventDefault();
  $("cfg-whats").value = dados.loja.whatsapp || "";
  $("form-mesa").hidden = true;
  $("area-lista").hidden = true;
  $("caixa-config").hidden = false;
});
$("cfg-cancelar").addEventListener("click", mostrarLista);
$("caixa-config").addEventListener("submit", async (e) => {
  e.preventDefault();
  erroGeral("");
  let whats = $("cfg-whats").value.replace(/\D/g, "");
  if (whats && whats.length <= 11) whats = "55" + whats; // só DDD + número: acrescenta o código do Brasil
  try {
    await publicar({ ...dados, loja: { ...dados.loja, whatsapp: whats } }, "Atualiza configurações do catálogo");
    mostrarLista();
  } catch (err) { erroGeral(err.message); }
});

(function iniciar() {
  const doEndereco = repoPeloEndereco();
  $("campos-repo").hidden = Boolean(doEndereco);
  const salvo = lembrado();
  if (salvo) {
    $("login-dono").value = salvo.dono || "";
    $("login-repo").value = salvo.nome || "catalogo-cmr";
    $("login-chave").value = salvo.chave || "";
  }
  $("tela-login").hidden = false;
  if (salvo && salvo.chave) entrar();
})();
