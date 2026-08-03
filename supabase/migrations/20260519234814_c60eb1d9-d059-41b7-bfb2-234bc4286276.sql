-- Bloqueio de escrita para usuários com cargo 'diretor'
-- Diretor mantém leitura completa e pode validar/reprovar (status), mas não pode criar, editar nem excluir dados.

create or replace function public.is_diretor(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = _uid and cargo = 'diretor')
$$;

-- FORMULARIOS
create or replace function public.tg_block_diretor_formularios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_diretor(v_uid) then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP = 'INSERT' then
    raise exception 'Diretor não tem permissão para criar formulários';
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Diretor não tem permissão para excluir formulários';
  end if;
  if TG_OP = 'UPDATE' then
    if (NEW.usuario_id is distinct from OLD.usuario_id)
       or (NEW.valor_agilitas is distinct from OLD.valor_agilitas)
       or (NEW.valor_marketing is distinct from OLD.valor_marketing)
       or (NEW.nome is distinct from OLD.nome)
       or (NEW.responsavel is distinct from OLD.responsavel)
       or (NEW.diretor is distinct from OLD.diretor)
       or (NEW.superintendente is distinct from OLD.superintendente)
       or (NEW.mes_referencia is distinct from OLD.mes_referencia)
       or (NEW.ano_referencia is distinct from OLD.ano_referencia)
       or (NEW.tipo is distinct from OLD.tipo)
       or (NEW.semana_inicio is distinct from OLD.semana_inicio)
    then
      raise exception 'Diretor só pode validar ou reprovar formulários';
    end if;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_block_diretor_formularios on public.formularios;
create trigger trg_block_diretor_formularios
before insert or update or delete on public.formularios
for each row execute function public.tg_block_diretor_formularios();

-- LANCAMENTOS
create or replace function public.tg_block_diretor_lancamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_diretor(v_uid) then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP = 'INSERT' then
    raise exception 'Diretor não tem permissão para criar lançamentos';
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Diretor não tem permissão para excluir lançamentos';
  end if;
  if TG_OP = 'UPDATE' then
    if (NEW.valor is distinct from OLD.valor)
       or (NEW.descricao is distinct from OLD.descricao)
       or (NEW.nome_recebedor is distinct from OLD.nome_recebedor)
       or (NEW.gerente is distinct from OLD.gerente)
       or (NEW.superintendente is distinct from OLD.superintendente)
       or (NEW.data_hora is distinct from OLD.data_hora)
       or (NEW.comprovante_url is distinct from OLD.comprovante_url)
       or (NEW.boleto_url is distinct from OLD.boleto_url)
       or (NEW.comp_corretor_url is distinct from OLD.comp_corretor_url)
       or (NEW.comp_gerente_url is distinct from OLD.comp_gerente_url)
       or (NEW.comp_sup_url is distinct from OLD.comp_sup_url)
       or (NEW.boleto_diretor_url is distinct from OLD.boleto_diretor_url)
       or (NEW.boleto_diretor_url is distinct from OLD.boleto_diretor_url)
       or (NEW.formulario_id is distinct from OLD.formulario_id)
       or (NEW.tipo_gasto is distinct from OLD.tipo_gasto)
       or (NEW.quem_pagou is distinct from OLD.quem_pagou)
       or (NEW.candidatos is distinct from OLD.candidatos)
       or (NEW.contratados is distinct from OLD.contratados)
       or (NEW.leads is distinct from OLD.leads)
       or (NEW.fonte is distinct from OLD.fonte)
       or (NEW.semana_inicio is distinct from OLD.semana_inicio)
       or (NEW.mes_ref is distinct from OLD.mes_ref)
       or (NEW.ano_ref is distinct from OLD.ano_ref)
       or (NEW.verba_superintendente is distinct from OLD.verba_superintendente)
       or (NEW.verba_gerente is distinct from OLD.verba_gerente)
       or (NEW.verba_cury is distinct from OLD.verba_cury)
       or (NEW.meta_sup is distinct from OLD.meta_sup)
       or (NEW.meta_gerente is distinct from OLD.meta_gerente)
       or (NEW.plantao is distinct from OLD.plantao)
       or (NEW.produto is distinct from OLD.produto)
       or (NEW.secao is distinct from OLD.secao)
       or (NEW.destinacao is distinct from OLD.destinacao)
    then
      raise exception 'Diretor só pode validar ou reprovar lançamentos';
    end if;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_block_diretor_lancamentos on public.lancamentos;
create trigger trg_block_diretor_lancamentos
before insert or update or delete on public.lancamentos
for each row execute function public.tg_block_diretor_lancamentos();

-- GERENTES (estrutura administrativa)
create or replace function public.tg_block_diretor_generic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is not null and public.is_diretor(v_uid) then
    raise exception 'Diretor não tem permissão para alterar dados nesta tabela';
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_block_diretor_gerentes on public.gerentes;
create trigger trg_block_diretor_gerentes
before insert or update or delete on public.gerentes
for each row execute function public.tg_block_diretor_generic();

drop trigger if exists trg_block_diretor_plantoes on public.plantoes_mes;
create trigger trg_block_diretor_plantoes
before insert or update or delete on public.plantoes_mes
for each row execute function public.tg_block_diretor_generic();

drop trigger if exists trg_block_diretor_previsoes on public.previsoes;
create trigger trg_block_diretor_previsoes
before insert or update or delete on public.previsoes
for each row execute function public.tg_block_diretor_generic();