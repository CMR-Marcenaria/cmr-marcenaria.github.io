-- Catálogo CMR Marcenaria: rode este arquivo inteiro no Supabase > SQL Editor.
-- Pode rodar de novo sem problema: ele não apaga dados.

create extension if not exists pgcrypto;

-- Quem pode editar o catálogo. Só usuários listados aqui conseguem salvar.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  criado_em timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Código automático das mesas: CMR-001, CMR-002...
create sequence if not exists public.mesa_codigo_seq;

create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique
    default ('CMR-' || lpad(nextval('public.mesa_codigo_seq')::text, 3, '0')),
  nome text not null,
  descricao text,
  madeira text,
  comprimento_cm numeric(6,1) not null check (comprimento_cm > 0),
  largura_cm numeric(6,1) not null check (largura_cm > 0),
  altura_cm numeric(6,1) check (altura_cm is null or altura_cm > 0),
  lugares int check (lugares is null or lugares > 0),
  preco_a_vista numeric(10,2) check (preco_a_vista is null or preco_a_vista >= 0),
  status text not null default 'disponivel'
    check (status in ('disponivel', 'reservado', 'vendido')),
  fotos text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists mesas_atualizado_em on public.mesas;
create trigger mesas_atualizado_em
  before update on public.mesas
  for each row execute function public.tocar_atualizado_em();

-- Segurança: qualquer pessoa lê o catálogo, só administradores alteram.
alter table public.mesas enable row level security;
alter table public.admins enable row level security;

drop policy if exists "catalogo publico" on public.mesas;
create policy "catalogo publico" on public.mesas
  for select to anon, authenticated using (true);

drop policy if exists "admin insere" on public.mesas;
create policy "admin insere" on public.mesas
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin atualiza" on public.mesas;
create policy "admin atualiza" on public.mesas
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin apaga" on public.mesas;
create policy "admin apaga" on public.mesas
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin ve a si mesmo" on public.admins;
create policy "admin ve a si mesmo" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Fotos: pasta pública para leitura, upload só por administradores.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "admin envia fotos" on storage.objects;
create policy "admin envia fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos' and public.is_admin());

drop policy if exists "admin altera fotos" on storage.objects;
create policy "admin altera fotos" on storage.objects
  for update to authenticated using (bucket_id = 'fotos' and public.is_admin());

drop policy if exists "admin apaga fotos" on storage.objects;
create policy "admin apaga fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos' and public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- DEPOIS de criar o usuário do cliente em Authentication > Users, libere o
-- acesso dele ao painel trocando o e-mail abaixo e rodando só estas linhas:
--
-- insert into public.admins (user_id, email)
-- select id, email from auth.users where email = 'email-do-cliente@exemplo.com'
-- on conflict (user_id) do nothing;
