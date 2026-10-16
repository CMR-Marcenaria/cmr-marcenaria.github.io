// Regera os arquivos públicos com as mesmas funções do painel (assets/comum.js).
// Uso: node regerar.js <pasta-do-repo> <site> [whatsapp]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [, , repo, site, whatsapp] = process.argv;
const ctx = { Intl, JSON, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, "assets/comum.js"), "utf8") + "\nthis.gerar = gerarArquivosPublicos;", ctx);

const CAMPOS = ["codigo", "nome", "descricao", "madeira", "comprimento_cm", "largura_cm", "altura_cm", "lugares", "preco_a_vista", "status", "fotos"];
const atual = JSON.parse(fs.readFileSync(path.join(repo, "dados/mesas.json"), "utf8"));
const estado = {
  loja: { ...atual.loja, ...(whatsapp ? { whatsapp } : {}) },
  mesas: atual.mesas.map((m) => Object.fromEntries(CAMPOS.map((c) => [c, m[c] ?? (c === "fotos" ? [] : null)]))),
};
const arquivos = ctx.gerar(estado, site);
for (const [rel, conteudo] of Object.entries(arquivos)) {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), conteudo);
}
console.log(`${Object.keys(arquivos).length} arquivos; whatsapp=${estado.loja.whatsapp}`);
