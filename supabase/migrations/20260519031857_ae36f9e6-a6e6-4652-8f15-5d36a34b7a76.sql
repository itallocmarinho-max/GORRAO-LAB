
-- Tipo discriminador
DO $$ BEGIN
  CREATE TYPE public.hierarquia_tipo AS ENUM ('superintendente','gerente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela de vínculos: alias (texto vindo do lead) -> entidade (profile sup OU gerente)
CREATE TABLE IF NOT EXISTS public.leads_hierarquia_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.hierarquia_tipo NOT NULL,
  alias text NOT NULL,
  alias_normalizado text NOT NULL,
  profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gerente_id uuid NULL REFERENCES public.gerentes(id) ON DELETE CASCADE,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_hierarquia_aliases_tipo_chk CHECK (
    (tipo = 'superintendente' AND profile_id IS NOT NULL AND gerente_id IS NULL)
    OR (tipo = 'gerente' AND gerente_id IS NOT NULL AND profile_id IS NULL)
  ),
  CONSTRAINT leads_hierarquia_aliases_unique UNIQUE (tipo, alias_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_lha_tipo_norm ON public.leads_hierarquia_aliases(tipo, alias_normalizado);
CREATE INDEX IF NOT EXISTS idx_lha_profile ON public.leads_hierarquia_aliases(profile_id);
CREATE INDEX IF NOT EXISTS idx_lha_gerente ON public.leads_hierarquia_aliases(gerente_id);

ALTER TABLE public.leads_hierarquia_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage hierarquia aliases"
ON public.leads_hierarquia_aliases
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "authenticated read hierarquia aliases"
ON public.leads_hierarquia_aliases
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER trg_lha_updated_at
BEFORE UPDATE ON public.leads_hierarquia_aliases
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
