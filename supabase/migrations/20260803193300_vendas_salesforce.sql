CREATE TABLE public.vendas_salesforce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_identificador text NOT NULL UNIQUE,
  status text,
  data_assinatura date,
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
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendas_salesforce ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins select vendas_salesforce"
ON public.vendas_salesforce
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
