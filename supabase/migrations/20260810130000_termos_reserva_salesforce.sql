CREATE TABLE IF NOT EXISTS public.termos_reserva_salesforce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_identificador text NOT NULL UNIQUE,
  status text,
  data_termo date,
  empreendimento text,
  unidade text,
  torre text,
  diretor text,
  superintendente text,
  gerente text,
  corretor text,
  tipo_venda text,
  diretor_fifty text,
  superintendente_fifty text,
  gerente_fifty text,
  corretor_fifty text,
  diretor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  superintendente_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  gerente_id uuid REFERENCES public.gerentes(id) ON DELETE SET NULL,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_termos_reserva_data
  ON public.termos_reserva_salesforce(data_termo);
CREATE INDEX IF NOT EXISTS idx_termos_reserva_superintendente
  ON public.termos_reserva_salesforce(superintendente_profile_id);
CREATE INDEX IF NOT EXISTS idx_termos_reserva_gerente
  ON public.termos_reserva_salesforce(gerente_id);

ALTER TABLE public.termos_reserva_salesforce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select termos_reserva_salesforce"
  ON public.termos_reserva_salesforce;
CREATE POLICY "Admins select termos_reserva_salesforce"
  ON public.termos_reserva_salesforce
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

COMMENT ON TABLE public.termos_reserva_salesforce IS
  'Espelho da aba LAB / / TERMO RESERVA. O Sheets é a fonte única e registros removidos da aba são removidos daqui.';
