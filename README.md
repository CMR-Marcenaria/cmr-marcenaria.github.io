# Catálogo CMR Marcenaria

Catálogo público de mesas rústicas, com painel protegido para o cliente atualizar
pelo celular e uma API para a IA do atendimento (Criativivo / OpenAI) consultar
disponibilidade, medidas, fotos e valor à vista.

Roda 100% na nuvem: **Vercel** (site) + **Supabase** (banco de dados, fotos e login).

## Endereços

| Endereço | Quem usa | Para quê |
|---|---|---|
| `/` | Público | Catálogo com fotos, filtrado por tamanho |
| `/mesa/CMR-001` | Público | Página da mesa (link que a IA manda ao cliente) |
| `/painel` | Só o cliente (login) | Cadastrar, editar, subir fotos, marcar como vendida |
| `/api/mesas` | IA | Lista em JSON (padrão: só disponíveis). Filtros: `categoria`, `comprimento_min`, `comprimento_max`, `largura_min`, `largura_max`, `preco_max`, `lugares_min`, `busca`, `status` |
| `/api/mesas/CMR-001` | IA | Confere uma mesa específica |
| `/openapi.json` | IA | Descrição da API para cadastrar como ferramenta/função |
| `/catalogo.txt` | IA | Catálogo em texto simples, para IAs que só leem páginas |

## Como colocar no ar

1. **Supabase** (supabase.com): crie um projeto. Em *SQL Editor*, cole e rode `supabase/schema.sql`.
2. Em *Authentication > Sign In / Providers*, desative **Allow new users to sign up**.
3. Em *Authentication > Users > Add user*, crie o login do cliente (e-mail + senha, marque *Auto Confirm*).
4. No *SQL Editor*, libere esse usuário no painel (troque o e-mail):
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'email-do-cliente@exemplo.com'
   on conflict (user_id) do nothing;
   ```
5. **Vercel** (vercel.com): entre com o GitHub, importe este repositório e cadastre as variáveis
   de `.env.example` (URL e chave *anon/publishable* ficam em *Supabase > Project Settings > API*).
6. Pronto: cada `git push` atualiza o site sozinho.

## Rodar no PC

```bash
npm install
copy .env.example .env.local   # preencha as chaves
npm run dev
```

Sem as chaves do Supabase o site abre em **modo demonstração**, com mesas de exemplo.
