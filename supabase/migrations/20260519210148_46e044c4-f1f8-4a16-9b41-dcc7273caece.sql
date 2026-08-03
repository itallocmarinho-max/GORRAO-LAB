
CREATE TABLE public.previsao_produto_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_solicitado text NOT NULL,
  justificativa text,
  status text NOT NULL DEFAULT 'pendente',
  solicitado_por uuid NOT NULL,
  revisado_por uuid,
  revisado_em timestamptz,
  motivo_rejeicao text,
  produto_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.previsao_produto_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own or admin all solicitacoes"
ON public.previsao_produto_solicitacoes
FOR SELECT
TO authenticated
USING (auth.uid() = solicitado_por OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own solicitacoes"
ON public.previsao_produto_solicitacoes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = solicitado_por);

CREATE POLICY "Admin update solicitacoes"
ON public.previsao_produto_solicitacoes
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete solicitacoes"
ON public.previsao_produto_solicitacoes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_previsao_produto_solic_updated
BEFORE UPDATE ON public.previsao_produto_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_previsao_produto_solic_status ON public.previsao_produto_solicitacoes(status);
CREATE INDEX idx_previsao_produto_solic_solicitado_por ON public.previsao_produto_solicitacoes(solicitado_por);
