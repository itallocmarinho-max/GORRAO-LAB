ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desativado_em date;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_desativacao_consistente;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_desativacao_consistente
  CHECK (
    (ativo = true AND desativado_em IS NULL)
    OR (ativo = false AND desativado_em IS NOT NULL)
  );

ALTER TABLE public.gerentes
  ADD COLUMN IF NOT EXISTS tipo_operacao text;

ALTER TABLE public.gerentes
  DROP CONSTRAINT IF EXISTS gerentes_tipo_operacao_valido;

ALTER TABLE public.gerentes
  ADD CONSTRAINT gerentes_tipo_operacao_valido
  CHECK (tipo_operacao IS NULL OR tipo_operacao IN ('pdv', 'cia'));

CREATE INDEX IF NOT EXISTS idx_profiles_atividade
  ON public.profiles (ativo, desativado_em);

COMMENT ON COLUMN public.profiles.desativado_em IS
  'Data de desativacao. O perfil permanece disponivel para lancamentos no proprio mes e sai dos meses posteriores.';

COMMENT ON COLUMN public.gerentes.tipo_operacao IS
  'Classificacao operacional do gerente: pdv ou cia.';
