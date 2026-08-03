
CREATE TABLE public.vendas_realizadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pv text NOT NULL,
  empreendimento text,
  data_assinatura date,
  superintendente text,
  gerente text,
  corretor text,
  diretor text,
  vgv numeric NOT NULL DEFAULT 0,
  unidades integer NOT NULL DEFAULT 1,
  import_batch_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX vendas_realizadas_pv_uq ON public.vendas_realizadas(pv);
CREATE INDEX vendas_realizadas_data_idx ON public.vendas_realizadas(data_assinatura);
CREATE INDEX vendas_realizadas_sup_idx ON public.vendas_realizadas(superintendente);
CREATE INDEX vendas_realizadas_ger_idx ON public.vendas_realizadas(gerente);

ALTER TABLE public.vendas_realizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage vendas_realizadas"
ON public.vendas_realizadas
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "authenticated read vendas_realizadas"
ON public.vendas_realizadas
FOR SELECT
TO authenticated
USING (true);
