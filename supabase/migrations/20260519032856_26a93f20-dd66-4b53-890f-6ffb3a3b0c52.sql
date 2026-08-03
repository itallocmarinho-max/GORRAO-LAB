ALTER TABLE public.gerentes
  ADD COLUMN IF NOT EXISTS inativo_mes smallint,
  ADD COLUMN IF NOT EXISTS inativo_ano smallint;