ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS superintendente text,
  ADD COLUMN IF NOT EXISTS leads integer,
  ADD COLUMN IF NOT EXISTS semana_inicio date,
  ADD COLUMN IF NOT EXISTS mes_ref smallint,
  ADD COLUMN IF NOT EXISTS ano_ref smallint;