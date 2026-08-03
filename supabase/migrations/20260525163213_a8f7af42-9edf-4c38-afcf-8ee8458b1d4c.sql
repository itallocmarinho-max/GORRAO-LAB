
-- Allow diretor to fully manage their OWN formularios and lancamentos.
-- Other users' rows: still status-change only (validar/reprovar/finalizar/voltar a editar).

CREATE OR REPLACE FUNCTION public.tg_block_diretor_formularios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null or not public.is_diretor(v_uid) then
    return coalesce(NEW, OLD);
  end if;

  -- Owner of this row (NEW for insert/update, OLD for delete)
  v_owner := coalesce(NEW.usuario_id, OLD.usuario_id);

  -- Diretor acting on own row: allow everything
  if v_owner = v_uid then
    return coalesce(NEW, OLD);
  end if;

  -- Diretor acting on someone else's row: only status changes are allowed
  if TG_OP = 'INSERT' then
    raise exception 'Diretor s\u00f3 pode criar formul\u00e1rios pr\u00f3prios';
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Diretor s\u00f3 pode excluir formul\u00e1rios pr\u00f3prios';
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
      raise exception 'Diretor s\u00f3 pode alterar status de formul\u00e1rios de outros usu\u00e1rios';
    end if;
  end if;
  return coalesce(NEW, OLD);
end $$;

CREATE OR REPLACE FUNCTION public.tg_block_diretor_lancamentos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_form_owner uuid;
begin
  if v_uid is null or not public.is_diretor(v_uid) then
    return coalesce(NEW, OLD);
  end if;

  select f.usuario_id into v_form_owner
  from public.formularios f
  where f.id = coalesce(NEW.formulario_id, OLD.formulario_id);

  -- Diretor acting on a lancamento of his OWN formulario: allow everything
  if v_form_owner = v_uid then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'INSERT' then
    raise exception 'Diretor s\u00f3 pode criar lan\u00e7amentos em formul\u00e1rios pr\u00f3prios';
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Diretor s\u00f3 pode excluir lan\u00e7amentos de formul\u00e1rios pr\u00f3prios';
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
      raise exception 'Diretor s\u00f3 pode alterar status de lan\u00e7amentos de outros usu\u00e1rios';
    end if;
  end if;
  return coalesce(NEW, OLD);
end $$;
