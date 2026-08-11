ALTER TABLE public.vendas_hierarquia_aliases
  ADD COLUMN IF NOT EXISTS externo boolean NOT NULL DEFAULT false;

ALTER TABLE public.vendas_hierarquia_aliases
  DROP CONSTRAINT IF EXISTS vendas_hierarquia_aliases_tipo_check,
  DROP CONSTRAINT IF EXISTS vendas_hierarquia_aliases_destino_chk;

ALTER TABLE public.vendas_hierarquia_aliases
  ADD CONSTRAINT vendas_hierarquia_aliases_tipo_check
    CHECK (tipo IN ('diretor', 'superintendente', 'gerente')),
  ADD CONSTRAINT vendas_hierarquia_aliases_destino_chk CHECK (
    (externo = true AND profile_id IS NULL AND gerente_id IS NULL)
    OR (
      externo = false
      AND tipo IN ('diretor', 'superintendente')
      AND profile_id IS NOT NULL
      AND gerente_id IS NULL
    )
    OR (
      externo = false
      AND tipo = 'gerente'
      AND gerente_id IS NOT NULL
      AND profile_id IS NULL
    )
  );

COMMENT ON COLUMN public.vendas_hierarquia_aliases.externo IS
  'Quando true, o nome continua visível na venda, mas não participa dos números gerenciais internos.';
