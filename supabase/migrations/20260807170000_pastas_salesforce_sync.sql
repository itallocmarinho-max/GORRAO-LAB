CREATE TABLE IF NOT EXISTS public.pastas_salesforce_pv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pv_identificador text NOT NULL,
  pv_chave text NOT NULL UNIQUE,
  data_criacao date,
  diretor text,
  superintendente text,
  gerente text,
  empreendimento text,
  diretor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  superintendente_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  gerente_id uuid REFERENCES public.gerentes(id) ON DELETE SET NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pastas_salesforce_ab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_identificador text NOT NULL UNIQUE,
  pv_identificador text NOT NULL,
  pv_chave text NOT NULL,
  data_criacao date,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pastas_salesforce_pv_data
  ON public.pastas_salesforce_pv(data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_pastas_salesforce_pv_diretor
  ON public.pastas_salesforce_pv(diretor_profile_id);
CREATE INDEX IF NOT EXISTS idx_pastas_salesforce_pv_superintendente
  ON public.pastas_salesforce_pv(superintendente_profile_id);
CREATE INDEX IF NOT EXISTS idx_pastas_salesforce_pv_gerente
  ON public.pastas_salesforce_pv(gerente_id);
CREATE INDEX IF NOT EXISTS idx_pastas_salesforce_pv_empreendimento
  ON public.pastas_salesforce_pv(empreendimento);
CREATE INDEX IF NOT EXISTS idx_pastas_salesforce_ab_pv
  ON public.pastas_salesforce_ab(pv_chave);
CREATE INDEX IF NOT EXISTS idx_pastas_salesforce_ab_data
  ON public.pastas_salesforce_ab(data_criacao DESC);

ALTER TABLE public.pastas_salesforce_pv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastas_salesforce_ab ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pastas Salesforce visíveis para diretoria"
ON public.pastas_salesforce_pv
FOR SELECT
USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "AB Salesforce visíveis para diretoria"
ON public.pastas_salesforce_ab
FOR SELECT
USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins gerenciam PV Salesforce"
ON public.pastas_salesforce_pv
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins gerenciam AB Salesforce"
ON public.pastas_salesforce_ab
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
