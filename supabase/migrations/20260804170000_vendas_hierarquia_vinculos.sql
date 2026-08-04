ALTER TABLE public.vendas_salesforce
  ADD COLUMN IF NOT EXISTS diretor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superintendente_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gerente_id uuid REFERENCES public.gerentes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_salesforce_diretor_profile
  ON public.vendas_salesforce(diretor_profile_id);
CREATE INDEX IF NOT EXISTS idx_vendas_salesforce_superintendente_profile
  ON public.vendas_salesforce(superintendente_profile_id);
CREATE INDEX IF NOT EXISTS idx_vendas_salesforce_gerente
  ON public.vendas_salesforce(gerente_id);

CREATE TABLE IF NOT EXISTS public.vendas_hierarquia_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('diretor', 'superintendente', 'gerente')),
  alias text NOT NULL,
  alias_normalizado text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  gerente_id uuid REFERENCES public.gerentes(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendas_hierarquia_aliases_destino_chk CHECK (
    (tipo IN ('diretor', 'superintendente') AND profile_id IS NOT NULL AND gerente_id IS NULL)
    OR (tipo = 'gerente' AND gerente_id IS NOT NULL AND profile_id IS NULL)
  ),
  CONSTRAINT vendas_hierarquia_aliases_unique UNIQUE (tipo, alias_normalizado)
);

ALTER TABLE public.vendas_hierarquia_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage vendas hierarchy aliases"
  ON public.vendas_hierarquia_aliases;
CREATE POLICY "Admins manage vendas hierarchy aliases"
  ON public.vendas_hierarquia_aliases
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
