-- Importacao temporaria do historico de Planejamento.
-- Os aliases sao persistidos por hierarquia para reaproveitamento em novas cargas.

create table if not exists public.planejamento_historico_vinculos (
  id uuid primary key default gen_random_uuid(),
  origem_tipo text not null check (origem_tipo in ('diretor', 'superintendente', 'gerente')),
  alias text not null,
  alias_normalizado text not null,
  contexto_alias text not null default '',
  contexto_normalizado text not null default '',
  profile_id uuid references public.profiles(id) on delete cascade,
  gerente_id uuid references public.gerentes(id) on delete cascade,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planejamento_historico_vinculos_destino_check check (
    (origem_tipo in ('diretor', 'superintendente') and profile_id is not null and gerente_id is null)
    or
    (origem_tipo = 'gerente' and gerente_id is not null and profile_id is null)
  ),
  unique (origem_tipo, alias_normalizado, contexto_normalizado)
);

alter table public.planejamento_historico_vinculos enable row level security;

drop policy if exists "Admins manage planejamento historico vinculos"
  on public.planejamento_historico_vinculos;
create policy "Admins manage planejamento historico vinculos"
  on public.planejamento_historico_vinculos
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create index if not exists planejamento_historico_vinculos_alias_idx
  on public.planejamento_historico_vinculos
  (origem_tipo, alias_normalizado, contexto_normalizado);

comment on table public.planejamento_historico_vinculos is
  'Vinculos persistentes usados pela importacao temporaria do historico de Planejamento.';
comment on column public.planejamento_historico_vinculos.contexto_alias is
  'Para gerentes, guarda o nome do superintendente no arquivo e evita conflito entre equipes.';
