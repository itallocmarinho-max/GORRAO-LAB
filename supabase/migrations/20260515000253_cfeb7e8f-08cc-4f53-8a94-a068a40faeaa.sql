ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cargo text;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_cargo_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_cargo_check
CHECK (cargo IS NULL OR cargo IN ('diretor', 'superintendente', 'administrador'));