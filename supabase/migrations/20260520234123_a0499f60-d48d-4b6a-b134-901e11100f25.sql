
CREATE TABLE public.lancamentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano smallint NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  destino_tipo text NOT NULL CHECK (destino_tipo IN ('diretor','superintendente')),
  destino_id uuid,
  destino_nome text NOT NULL,
  gerente_id uuid,
  gerente_nome text,
  descricao text,
  valor numeric NOT NULL DEFAULT 0,
  tipo_gasto text NOT NULL CHECK (tipo_gasto IN ('manutencao','gerar_venda')),
  comprovantes jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financ select"
ON public.lancamentos_financeiros FOR SELECT
USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "financ insert"
ON public.lancamentos_financeiros FOR INSERT
WITH CHECK (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "financ update"
ON public.lancamentos_financeiros FOR UPDATE
USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role))
WITH CHECK (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "financ delete"
ON public.lancamentos_financeiros FOR DELETE
USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX idx_lancamentos_financeiros_mes_ano ON public.lancamentos_financeiros (ano, mes);

INSERT INTO storage.buckets (id, name, public) VALUES ('financeiro-anexos','financeiro-anexos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "financ anexos select"
ON storage.objects FOR SELECT
USING (bucket_id = 'financeiro-anexos' AND (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role)));

CREATE POLICY "financ anexos insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'financeiro-anexos' AND (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role)));

CREATE POLICY "financ anexos delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'financeiro-anexos' AND (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role)));
