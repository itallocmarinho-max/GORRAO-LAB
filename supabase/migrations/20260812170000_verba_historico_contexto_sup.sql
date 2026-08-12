-- Um mesmo gerente pode aparecer sob superintendentes diferentes ao longo do historico.
-- O vinculo do destino passa a considerar tambem o SUP informado na linha.

alter table public.verba_cury_historico_vinculos
  add column if not exists contexto_alias text not null default '',
  add column if not exists contexto_normalizado text not null default '';

alter table public.verba_cury_historico_vinculos
  drop constraint if exists verba_cury_historico_vinculos_origem_tipo_alias_normalizado_key;

drop index if exists public.verba_cury_historico_vinculos_origem_tipo_alias_normalizado_key;

create unique index if not exists verba_cury_historico_vinculos_contexto_unique
  on public.verba_cury_historico_vinculos
  (origem_tipo, alias_normalizado, contexto_normalizado);

drop index if exists public.verba_cury_historico_vinculos_alias_idx;
create index if not exists verba_cury_historico_vinculos_alias_idx
  on public.verba_cury_historico_vinculos
  (origem_tipo, alias_normalizado, contexto_normalizado);

comment on column public.verba_cury_historico_vinculos.contexto_alias is
  'Para destinos, guarda o SUP informado na linha e preserva mudancas historicas de equipe.';
