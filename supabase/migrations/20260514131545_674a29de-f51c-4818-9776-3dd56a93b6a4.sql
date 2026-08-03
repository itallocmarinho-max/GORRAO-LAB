ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS plantao text,
  ADD COLUMN IF NOT EXISTS meta_gerente numeric,
  ADD COLUMN IF NOT EXISTS meta_sup numeric,
  ADD COLUMN IF NOT EXISTS verba_cury numeric,
  ADD COLUMN IF NOT EXISTS verba_gerente numeric,
  ADD COLUMN IF NOT EXISTS verba_superintendente numeric,
  ADD COLUMN IF NOT EXISTS secao text;