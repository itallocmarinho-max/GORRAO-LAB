
ALTER TABLE public.leads_facebook
  ADD COLUMN IF NOT EXISTS gerente text,
  ADD COLUMN IF NOT EXISTS superintendente text,
  ADD COLUMN IF NOT EXISTS fonte text,
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS responsavel text;
