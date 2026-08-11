-- O campo SUP dos arquivos historicos tambem pode conter diretamente o diretor.
alter table public.verba_cury_historico_vinculos
  drop constraint if exists verba_cury_historico_vinculos_sup_check;

alter table public.verba_cury_historico_vinculos
  add constraint verba_cury_historico_vinculos_sup_check check (
    origem_tipo <> 'superintendente'
    or destino_tipo in ('diretor', 'superintendente')
  );
