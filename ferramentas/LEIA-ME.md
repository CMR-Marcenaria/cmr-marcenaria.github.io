# Ferramentas do catálogo

Scripts usados para montar este catálogo. Rode na pasta do projeto, com o Node.js instalado.

| Arquivo | Para que serve |
|---|---|
| `importar-crm-antigo.js` | Importa as mesas e baixa as fotos do CRM antigo a partir de `crm-antigo-exportado.json`. **Sobrescreve** `dados/mesas.json`: use só para recomeçar do zero. |
| `crm-antigo-exportado.json` | Dados exportados do CRM antigo em 16/10/2026 (57 peças). |
| `regerar-publicacao.js` | Regera `dados/mesas.json`, `catalogo.txt` e as páginas `m/*.html` a partir das mesas atuais. Útil ao mudar de endereço (domínio) ou de número de WhatsApp. |
| `servidor-local.js` | Abre o site no PC para testar: `node ferramentas/servidor-local.js .` e acesse http://localhost:5500 |

Exemplos:

```
node ferramentas/regerar-publicacao.js . https://cmr-marcenaria.github.io 5545920016018
node ferramentas/servidor-local.js .
```

Antes de regerar, rode `git pull` para trazer as alterações feitas pelo painel.
