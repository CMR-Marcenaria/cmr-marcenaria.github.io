# Catálogo CMR Marcenaria

Catálogo público de mesas rústicas, hospedado de graça no **GitHub Pages**.
Não tem servidor nem banco de dados: as mesas ficam em `dados/mesas.json` e as fotos em `fotos/`.

## Endereços

| Endereço | Quem usa | Para quê |
|---|---|---|
| `/` | Público | Catálogo com fotos, filtrado por tamanho |
| `/mesa.html?c=CMR-001` | Público | Página da mesa (link que a IA manda ao cliente) |
| `/painel.html` | Só quem tem a chave | Cadastrar, editar, subir fotos, marcar como vendida |
| `/dados/mesas.json` | IA | Todas as mesas em JSON, com `disponivel`, `preco_texto`, `link` e `fotos_url` |
| `/catalogo.txt` | IA | Só as mesas disponíveis, em texto simples |

## Como o painel funciona

O painel salva direto neste repositório usando uma **chave de acesso do GitHub**
(fine-grained token) com permissão apenas neste repositório. Sem a chave, ninguém altera nada.
Cada alteração aparece no site em 1 a 2 minutos.

### Criar a chave de acesso

1. GitHub > foto do perfil > **Settings** > **Developer settings** > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.
2. Nome: `painel catalogo`. Validade: até 1 ano.
3. **Repository access**: *Only select repositories* > `catalogo-cmr`.
4. **Permissions** > *Repository permissions* > **Contents: Read and write**.
5. **Generate token**, copie e cole no painel (marque "Lembrar neste aparelho").

Se a chave vazar, apague-a nessa mesma tela e gere outra.
