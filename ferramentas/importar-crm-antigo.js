// Importa o catálogo do CRM antigo para o repositório novo.
// Uso: node importar.js <crm-antigo.json> <pasta-do-repo> <site-publico>
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [, , origem, repo, site] = process.argv;
const ctx = { Intl, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, "assets/comum.js"), "utf8") + "\nthis.F={categoriaDe,faixaTexto,medidasTexto,precoTexto};", ctx);
const { categoriaDe, faixaTexto, medidasTexto, precoTexto } = ctx.F;

const MADEIRAS = [[/pequi[aá]/i, "Pequiá"], [/garapeira/i, "Garapeira"], [/\bip[eê]\b/i, "Ipê"], [/canela/i, "Canela"], [/angelin/i, "Angelim pedra"], [/mirindiba/i, "Mirindiba"], [/pinheiro/i, "Pinheiro"]];

async function baixar(arquivo, destino) {
  if (fs.existsSync(destino)) return;
  const r = await fetch(`https://179-198-112-120.nip.io/catalogo-fotos/${encodeURIComponent(arquivo)}`);
  if (!r.ok) throw new Error(`foto ${arquivo}: HTTP ${r.status}`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

(async () => {
  const linhas = JSON.parse(fs.readFileSync(origem, "utf8"));
  fs.mkdirSync(path.join(repo, "fotos"), { recursive: true });
  const mesas = [];
  for (const [codigo, nomeBruto, descricao, comp, larg, alt, lugares, aVista, aprox, , ativo, , arquivos] of linhas) {
    const nome = nomeBruto.trim().replace(/\bpramcha\b/i, "prancha");
    const fotos = [];
    for (const [i, arquivo] of arquivos.entries()) {
      const rel = `fotos/${codigo}-${i + 1}-${arquivo.split("-")[0].slice(-6)}.jpg`;
      await baixar(arquivo, path.join(repo, rel));
      fotos.push(rel);
    }
    const madeira = (MADEIRAS.find(([re]) => re.test(nome)) || [])[1] || null;
    mesas.push({
      codigo, nome, descricao: descricao || null, madeira,
      comprimento_cm: comp, largura_cm: larg, altura_cm: alt ?? null, lugares: lugares ?? null,
      preco_a_vista: aVista ?? aprox ?? null, status: ativo === false ? "vendido" : "disponivel", fotos,
    });
  }

  // Mesmo formato que o painel gera (assets/painel.js > gerarPublicacao)
  const publicas = mesas.map((m) => {
    const categoria = categoriaDe(m.comprimento_cm);
    return {
      ...m, disponivel: m.status === "disponivel", categoria, faixa_comprimento: categoria ? faixaTexto(categoria) : null,
      medidas: medidasTexto(m), preco_texto: precoTexto(m.preco_a_vista),
      link: `${site}/mesa.html?c=${encodeURIComponent(m.codigo)}`, fotos_url: m.fotos.map((f) => `${site}/${f}`),
    };
  }).sort((a, b) => a.comprimento_cm - b.comprimento_cm);

  const atual = JSON.parse(fs.readFileSync(path.join(repo, "dados/mesas.json"), "utf8"));
  const agora = new Date();
  fs.writeFileSync(path.join(repo, "dados/mesas.json"), JSON.stringify({
    loja: atual.loja, site, atualizado_em: agora.toISOString(), observacao: atual.observacao,
    total_disponiveis: publicas.filter((m) => m.disponivel).length, mesas: publicas,
  }, null, 2) + "\n");

  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(agora);
  const disp = publicas.filter((m) => m.disponivel);
  const txt = ["CATÁLOGO CMR MARCENARIA — MESAS RÚSTICAS DISPONÍVEIS", `Atualizado em ${quando}. Total disponível: ${disp.length}.`,
    "Valores à vista. Só estão listadas mesas prontas e disponíveis para venda.", "Ao responder o cliente, envie o nome, as medidas, o valor e o link da mesa.", ""];
  for (const m of disp) {
    txt.push(`[${m.codigo}] ${m.nome}`, `  Medidas: ${m.medidas}${m.categoria ? ` · Categoria ${m.categoria}` : ""}${m.lugares ? ` · ${m.lugares} lugares` : ""}`,
      ...(m.madeira ? [`  Madeira: ${m.madeira}`] : []), ...(m.descricao ? [`  Descrição: ${m.descricao}`] : []),
      `  Valor à vista: ${m.preco_texto}`, `  Link: ${m.link}`, ...(m.fotos_url[0] ? [`  Foto: ${m.fotos_url[0]}`] : []), "");
  }
  fs.writeFileSync(path.join(repo, "catalogo.txt"), txt.join("\n") + "\n");

  const semPreco = mesas.filter((m) => m.preco_a_vista == null).map((m) => m.codigo);
  const precoAlto = mesas.filter((m) => m.preco_a_vista > 20000).map((m) => `${m.codigo}=${m.preco_a_vista}`);
  console.log(JSON.stringify({ total: mesas.length, fotos: mesas.reduce((s, m) => s + m.fotos.length, 0), semPreco, precoAlto }));
})().catch((e) => { console.error(e); process.exit(1); });
