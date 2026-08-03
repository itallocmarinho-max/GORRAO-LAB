ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS reprovado boolean NOT NULL DEFAULT false;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS motivo_reprovacao text;