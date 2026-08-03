ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS comp_corretor_url text,
  ADD COLUMN IF NOT EXISTS comp_gerente_url text,
  ADD COLUMN IF NOT EXISTS comp_sup_url text,
  ADD COLUMN IF NOT EXISTS boleto_diretor_url text;