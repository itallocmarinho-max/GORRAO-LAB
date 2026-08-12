-- Base oficial CONTABIL: recebe o historico e, futuramente, a sincronizacao do Google Sheets.

create table if not exists public.contabil_pessoas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('diretor', 'superintendente', 'gerente')),
  nome text not null,
  nome_normalizado text not null,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  parent_pessoa_id uuid references public.contabil_pessoas(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contabil_pessoas_parent_check check (
    (tipo = 'diretor' and parent_profile_id is null and parent_pessoa_id is null)
    or
    (tipo in ('superintendente', 'gerente') and num_nonnulls(parent_profile_id, parent_pessoa_id) = 1)
  ),
  unique (tipo, nome_normalizado, parent_profile_id, parent_pessoa_id)
);

create table if not exists public.contabil_hierarquia_aliases (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('diretor', 'superintendente', 'gerente')),
  alias text not null,
  alias_normalizado text not null,
  contexto_alias text not null default '',
  contexto_normalizado text not null default '',
  profile_id uuid references public.profiles(id) on delete cascade,
  gerente_id uuid references public.gerentes(id) on delete cascade,
  pessoa_id uuid references public.contabil_pessoas(id) on delete cascade,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contabil_hierarquia_aliases_destino_check check (
    num_nonnulls(profile_id, gerente_id, pessoa_id) = 1
    and (tipo <> 'gerente' or profile_id is null)
    and (tipo = 'gerente' or gerente_id is null)
  ),
  unique (tipo, alias_normalizado, contexto_normalizado)
);

create table if not exists public.contabil_salesforce (
  id uuid primary key default gen_random_uuid(),
  chave_origem text not null unique,
  origem text not null default 'historico' check (origem in ('historico', 'google_sheets')),
  pv text not null,
  empreendimento text,
  torre text,
  unidade text,
  corretor text,
  gerente text,
  superintendente text,
  diretor text,
  vgv numeric not null default 0,
  tipo_venda text,
  quantidade numeric not null default 0,
  mes integer not null check (mes between 1 and 12),
  trimestre text,
  ano integer not null check (ano between 2000 and 2100),
  canal text,
  cidade text,
  regiao text,
  plantao text,
  diretor_nome_ref text,
  superintendente_nome_ref text,
  gerente_nome_ref text,
  diretor_profile_id uuid references public.profiles(id) on delete set null,
  superintendente_profile_id uuid references public.profiles(id) on delete set null,
  gerente_id uuid references public.gerentes(id) on delete set null,
  diretor_pessoa_id uuid references public.contabil_pessoas(id) on delete set null,
  superintendente_pessoa_id uuid references public.contabil_pessoas(id) on delete set null,
  gerente_pessoa_id uuid references public.contabil_pessoas(id) on delete set null,
  importado_por uuid references auth.users(id) on delete set null,
  importado_em timestamptz not null default now(),
  sincronizado_em timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create index if not exists contabil_salesforce_periodo_idx
  on public.contabil_salesforce (ano, mes);
create index if not exists contabil_salesforce_sup_profile_idx
  on public.contabil_salesforce (superintendente_profile_id, ano, mes);
create index if not exists contabil_salesforce_gerente_idx
  on public.contabil_salesforce (gerente_id, ano, mes);
create index if not exists contabil_salesforce_plantao_idx
  on public.contabil_salesforce (plantao, ano, mes);
create index if not exists contabil_alias_lookup_idx
  on public.contabil_hierarquia_aliases (tipo, alias_normalizado, contexto_normalizado);

alter table public.contabil_pessoas enable row level security;
alter table public.contabil_hierarquia_aliases enable row level security;
alter table public.contabil_salesforce enable row level security;

drop policy if exists "Admins manage contabil pessoas" on public.contabil_pessoas;
create policy "Admins manage contabil pessoas"
  on public.contabil_pessoas for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins manage contabil aliases" on public.contabil_hierarquia_aliases;
create policy "Admins manage contabil aliases"
  on public.contabil_hierarquia_aliases for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins read contabil" on public.contabil_salesforce;
create policy "Admins read contabil"
  on public.contabil_salesforce for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

comment on table public.contabil_salesforce is
  'Base oficial contabil. Historico por arquivo e futuras cargas integrais do Google Sheets.';
comment on table public.contabil_pessoas is
  'Pessoas historicas sem login usadas para preservar hierarquias antigas do CONTABIL.';
comment on table public.contabil_hierarquia_aliases is
  'Vinculos persistentes dos nomes de origem do CONTABIL com a hierarquia interna ou historica.';
