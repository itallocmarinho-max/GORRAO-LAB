-- Importacao temporaria do historico de Verba Cury.
-- Os vinculos ficam persistidos para que o mesmo alias nao precise ser classificado novamente.

create table if not exists public.verba_cury_historico_vinculos (
  id uuid primary key default gen_random_uuid(),
  origem_tipo text not null check (origem_tipo in ('superintendente', 'destino')),
  alias text not null,
  alias_normalizado text not null,
  destino_tipo text not null check (destino_tipo in ('diretor', 'superintendente', 'gerente')),
  profile_id uuid references public.profiles(id) on delete cascade,
  gerente_id uuid references public.gerentes(id) on delete cascade,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verba_cury_historico_vinculos_destino_check check (
    (destino_tipo = 'gerente' and gerente_id is not null and profile_id is null)
    or
    (destino_tipo in ('diretor', 'superintendente') and profile_id is not null and gerente_id is null)
  ),
  constraint verba_cury_historico_vinculos_sup_check check (
    origem_tipo <> 'superintendente' or destino_tipo = 'superintendente'
  ),
  unique (origem_tipo, alias_normalizado)
);

alter table public.verba_cury_historico_vinculos enable row level security;

drop policy if exists "Admins manage verba cury historico vinculos"
  on public.verba_cury_historico_vinculos;
create policy "Admins manage verba cury historico vinculos"
  on public.verba_cury_historico_vinculos
  for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

alter table public.lancamentos
  add column if not exists importacao_historica_chave text,
  add column if not exists importacao_historica_em timestamptz,
  add column if not exists importacao_historica_por uuid references auth.users(id) on delete set null;

create unique index if not exists lancamentos_importacao_historica_chave_uidx
  on public.lancamentos (importacao_historica_chave);

create index if not exists verba_cury_historico_vinculos_alias_idx
  on public.verba_cury_historico_vinculos (origem_tipo, alias_normalizado);

comment on table public.verba_cury_historico_vinculos is
  'Vinculos persistentes usados pela importacao temporaria do historico de Verba Cury.';
comment on column public.lancamentos.importacao_historica_chave is
  'Chave idempotente que impede a mesma linha historica de ser importada duas vezes.';
