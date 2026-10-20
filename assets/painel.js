// Painel do catálogo: edita as mesas e salva direto no repositório do GitHub.
// Cada "Salvar" vira um commit; o GitHub Pages publica a nova versão em 1–2 minutos.

const API = "https://api.github.com";
const CHAVE_LOCAL = "cmr_painel";
const CAMPOS = ["codigo", "nome", "descricao", "madeira", "comprimento_cm", "largura_cm", "altura_cm", "lugares", "preco_a_vista", "status", "fotos", "video"];

const $ = (id) => document.getElementById(id);
let acesso = { dono: "", nome: "", chave: "", branch: "main" };
let dados = { loja: { nome: "CMR Marcenaria", whatsapp: "" }, mesas: [] };
let filtro = "todas";
let editando = null; // null | "nova" | mesa
let fotosForm = []; // { caminho } já publicada  |  { arquivo, previa } nova
let fotosRemovidas = [];
let videoForm = { atual: null, arquivo: null, previa: null, removido: false };
const VIDEO_MAX_MB = 30;

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

/** Continua a numeração existente: "113" vira "114"; "CMR-007" vira "CMR-008". */
function proximoCodigo() {
  let maior = 0;
  let prefixo = dados.mesas.length ? "" : "CMR-";
  let digitos = dados.mesas.length ? 1 : 3;
  for (const m of dados.mesas) {
    const r = /^(.*?)(\d+)$/.exec(m.codigo);
    if (r && Number(r[2]) >= maior) { maior = Number(r[2]); prefixo = r[1]; digitos = r[2].length; }
  }
  return `${prefixo}${String(maior + 1).padStart(digitos, "0")}`;
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
      r.status === 403 || r.status === 404 ? `Essa chave não tem acesso ao repositório ${acesso.dono}/${acesso.nome}. Confira se a chave foi aprovada na organização, se o "Resource owner" é a organização e se o repositório e a permissão Contents (Read and write) foram marcados.` :
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

/**
 * Arquivos a gravar no commit: JSON e texto para a IA sempre, e só as páginas
 * curtas (m/*.html) das mesas que mudaram ou foram apagadas.
 */
function arquivosDaPublicacao(anterior, novo) {
  const arquivos = gerarArquivosPublicos(novo, enderecoPublico());
  const antes = new Map(anterior.mesas.map((m) => [slugCodigo(m.codigo), JSON.stringify(m)]));
  const depois = new Set();
  for (const m of novo.mesas) {
    const slug = slugCodigo(m.codigo);
    depois.add(slug);
    if (antes.get(slug) === JSON.stringify(m)) delete arquivos[`m/${slug}.html`];
  }
  for (const slug of antes.keys()) if (!depois.has(slug)) arquivos[`m/${slug}.html`] = null;
  return arquivos;
}

async function publicar(novoEstado, mensagem, extras = {}) {
  await commitar(mensagem, { ...extras, ...arquivosDaPublicacao(dados, novoEstado) });
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
        <div class="codigo">${esc(m.codigo)}${cat ? ` · Cat. ${cat}` : ""} · ${m.fotos.length} foto(s)${m.video ? " · vídeo" : ""}</div>
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
  limparVideoForm();
  videoForm.atual = mesa ? mesa.video : null;
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
  f.elements.video_link.value = videoForm.atual && /^https?:\/\//i.test(videoForm.atual) ? videoForm.atual : "";
  atualizarCategoria();
  desenharFotosForm();
  desenharVideoForm();
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

function limparVideoForm() {
  if (videoForm.previa) URL.revokeObjectURL(videoForm.previa);
  videoForm = { atual: null, arquivo: null, previa: null, removido: false };
}

/** Vídeo já enviado para o site (videos/…), que precisa ser apagado se for trocado. */
function videoLocal(caminho) {
  return caminho && !/^https?:\/\//i.test(caminho) ? caminho : null;
}

function desenharVideoForm() {
  const local = videoLocal(videoForm.atual);
  const src = videoForm.previa || (local && !videoForm.removido ? local : null);
  $("form-video").innerHTML = src ? `
    <div class="video-edicao">
      <video src="${esc(src)}" controls preload="metadata" playsinline></video>
      <div>
        <div class="dica">${videoForm.arquivo ? `Novo vídeo: ${esc(videoForm.arquivo.name)} (${(videoForm.arquivo.size / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB). Será enviado ao salvar.` : "Vídeo publicado."}</div>
        <button type="button" class="botao pequeno perigo" id="btn-remover-video">Remover vídeo</button>
      </div>
    </div>` : "";
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
  const linkVideo = f.video_link.value.trim();
  if (!videoForm.arquivo && linkVideo && !/^https?:\/\/\S+$/i.test(linkVideo)) return erro("O link do vídeo precisa começar com https:// (ex.: link do YouTube).");

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

    const videoAnterior = videoLocal(videoForm.atual);
    let video = null;
    if (videoForm.arquivo) {
      $("form-progresso").textContent = "Preparando vídeo…";
      const ext = (/\.(mp4|mov|webm|m4v)$/i.exec(videoForm.arquivo.name) || [, "mp4"])[1].toLowerCase();
      video = `videos/${codigo.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      extras[video] = { base64: await blobParaBase64(videoForm.arquivo) };
    } else if (linkVideo) {
      video = linkVideo;
    } else if (videoAnterior && !videoForm.removido) {
      video = videoAnterior;
    }
    if (videoAnterior && video !== videoAnterior) extras[videoAnterior] = null;

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
      video,
    });
    const mesas = anterior ? dados.mesas.map((m) => (m === anterior ? mesa : m)) : [...dados.mesas, mesa];

    $("form-progresso").textContent = videoForm.arquivo ? "Enviando para o GitHub… vídeos podem levar alguns minutos, não feche a página." : "Enviando para o GitHub…";
    await publicar({ ...dados, mesas }, `${anterior ? "Atualiza" : "Cadastra"} mesa ${codigo}`, extras);
    fotosForm.forEach((x) => x.previa && URL.revokeObjectURL(x.previa));
    limparVideoForm();
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
    if (!mesa || !confirm(`Apagar a mesa ${mesa.codigo} (${mesa.nome}) e as fotos${mesa.video ? " e o vídeo" : ""} dela?`)) return;
    erroGeral("");
    try {
      const extras = Object.fromEntries(mesa.fotos.map((c) => [c, null]));
      if (videoLocal(mesa.video)) extras[mesa.video] = null;
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

// ── Acesso por senha ────────────────────────────────────────────────────────
// A chave do GitHub fica em dados/acesso.json, criptografada (AES-GCM) com uma
// chave derivada da senha do lojista (PBKDF2). Sem a senha, o arquivo não serve para nada.

const ITERACOES = 600000;
const paraB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function chaveDaSenha(senha, sal, iteracoes) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function cifrar(texto, senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await chaveDaSenha(senha, sal, ITERACOES);
  const dados = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(texto));
  return { iteracoes: ITERACOES, sal: paraB64(sal), iv: paraB64(iv), dados: paraB64(dados) };
}

async function decifrar(pacote, senha) {
  try {
    const chave = await chaveDaSenha(senha, deB64(pacote.sal), pacote.iteracoes);
    const texto = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(pacote.iv) }, chave, deB64(pacote.dados));
    return new TextDecoder().decode(texto);
  } catch {
    throw new Error("Usuário ou senha incorretos.");
  }
}

/** Valida a chave no GitHub, carrega o catálogo e abre a gestão. */
async function conectar(dono, nome, chave, lembrar) {
  acesso = { dono, nome, chave, branch: "main" };
  const repo = await gh(repoUrl());
  if (!repo.permissions || !repo.permissions.push) throw new Error("Essa chave só pode ler. Crie a chave com permissão de escrita (Contents: Read and write).");
  acesso.branch = repo.default_branch || "main";
  await lerDados();
  guardar({ dono, nome, chave }, lembrar);
  $("tela-login").hidden = true;
  $("tela-configurar").hidden = true;
  $("tela-gestao").hidden = false;
  mostrarLista();
}

async function entrar(e) {
  e.preventDefault();
  $("login-erro").textContent = "";
  $("btn-entrar").disabled = true;
  try {
    const r = await fetch(`dados/acesso.json?t=${Date.now()}`, { cache: "no-store" });
    if (r.status === 404) { abrirConfiguracao("Nenhum usuário foi cadastrado ainda. A agência precisa concluir esta configuração (clicar em Salvar acesso sem erro)."); return; }
    if (!r.ok) throw new Error("Não foi possível verificar o acesso. Tente de novo.");
    const pacote = await r.json();
    const usuario = $("login-usuario").value.trim().toLowerCase();
    const cofre = (pacote.usuarios || {})[usuario];
    if (!cofre) throw new Error("Usuário ou senha incorretos.");
    const chave = await decifrar(cofre, $("login-senha").value);
    await conectar(pacote.dono, pacote.nome, chave, $("login-lembrar").checked);
    $("login-senha").value = "";
  } catch (err) {
    $("login-erro").textContent = err.status === 401 ? "A chave de acesso venceu ou foi apagada. Peça para a agência configurar de novo." : err.message;
  } finally {
    $("btn-entrar").disabled = false;
  }
}

function abrirConfiguracao(mensagem) {
  const doEndereco = repoPeloEndereco();
  $("campos-repo").hidden = Boolean(doEndereco);
  if (acesso.chave) {
    $("cfg-chave").value = acesso.chave;
    $("login-dono").value = acesso.dono;
    $("login-repo").value = acesso.nome;
  }
  $("cfg-erro").textContent = mensagem || "";
  $("tela-login").hidden = true;
  $("tela-gestao").hidden = true;
  $("tela-configurar").hidden = false;
}

async function configurarAcesso(e) {
  e.preventDefault();
  const erro = (t) => { $("cfg-erro").textContent = t; };
  erro("");
  const usuario = $("cfg-usuario").value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return erro("Usuário: de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado.");
  const senha = $("cfg-senha").value;
  if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
  if (senha !== $("cfg-senha2").value) return erro("As senhas não são iguais.");
  const doEndereco = repoPeloEndereco();
  const dono = doEndereco ? doEndereco.dono : $("login-dono").value.trim();
  const nome = doEndereco ? doEndereco.nome : $("login-repo").value.trim();
  const chave = $("cfg-chave").value.trim();
  if (!dono || !nome || !chave) return erro("Preencha todos os campos.");

  $("btn-configurar").disabled = true;
  try {
    await conectar(dono, nome, chave, true);
    // Mantém os outros usuários; cada um tem a chave cifrada com a própria senha
    let usuarios = {};
    try {
      const atual = await gh(`${repoUrl()}/contents/dados/acesso.json?ref=${acesso.branch}`);
      usuarios = JSON.parse(base64ParaTexto(atual.content)).usuarios || {};
    } catch (err) { if (err.status !== 404) throw err; }
    usuarios[usuario] = await cifrar(chave, senha);
    const pacote = { versao: 2, dono, nome, usuarios };
    await commitar(`Atualiza acesso ao painel (usuário ${usuario})`, { "dados/acesso.json": JSON.stringify(pacote, null, 2) + "\n" });
    $("cfg-senha").value = $("cfg-senha2").value = $("cfg-chave").value = $("cfg-usuario").value = "";
    avisar(`Acesso salvo! O usuário ${usuario} já pode entrar com a senha (em 1 a 2 minutos).`);
  } catch (err) {
    abrirConfiguracao(err.message);
  } finally {
    $("btn-configurar").disabled = false;
  }
}

// ── Início ──────────────────────────────────────────────────────────────────

$("tela-login").addEventListener("submit", entrar);
$("tela-configurar").addEventListener("submit", configurarAcesso);
$("link-configurar").addEventListener("click", (e) => { e.preventDefault(); abrirConfiguracao(); });
$("btn-trocar-senha").addEventListener("click", (e) => { e.preventDefault(); abrirConfiguracao(); });
$("btn-voltar-login").addEventListener("click", () => {
  $("tela-configurar").hidden = true;
  if (acesso.chave) { $("tela-gestao").hidden = false; mostrarLista(); } else $("tela-login").hidden = false;
});
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

$("form-video-arquivo").addEventListener("change", (e) => {
  const arquivo = e.target.files[0];
  e.target.value = "";
  if (!arquivo) return;
  if (arquivo.size > VIDEO_MAX_MB * 1048576) {
    $("form-erro").textContent = `Esse vídeo tem ${Math.round(arquivo.size / 1048576)} MB. O limite é ${VIDEO_MAX_MB} MB: grave um vídeo mais curto (até 1 minuto) ou envie para o YouTube e cole o link.`;
    return;
  }
  $("form-erro").textContent = "";
  if (videoForm.previa) URL.revokeObjectURL(videoForm.previa);
  videoForm.arquivo = arquivo;
  videoForm.previa = URL.createObjectURL(arquivo);
  $("form-mesa").elements.video_link.value = "";
  desenharVideoForm();
});

$("form-video").addEventListener("click", (e) => {
  if (!e.target.closest("#btn-remover-video")) return;
  if (videoForm.previa) URL.revokeObjectURL(videoForm.previa);
  videoForm.arquivo = null;
  videoForm.previa = null;
  videoForm.removido = true;
  desenharVideoForm();
});

$("form-mesa").elements.video_link.addEventListener("input", (e) => {
  if (!e.target.value.trim() || !videoForm.arquivo) return;
  URL.revokeObjectURL(videoForm.previa);
  videoForm.arquivo = null;
  videoForm.previa = null;
  desenharVideoForm();
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

(async function iniciar() {
  const salvo = lembrado();
  if (salvo && salvo.chave) {
    try { await conectar(salvo.dono, salvo.nome, salvo.chave, Boolean(localStorage.getItem(CHAVE_LOCAL))); return; }
    catch { guardar(null); acesso = { dono: "", nome: "", chave: "", branch: "main" }; }
  }
  $("tela-login").hidden = false;
})();
