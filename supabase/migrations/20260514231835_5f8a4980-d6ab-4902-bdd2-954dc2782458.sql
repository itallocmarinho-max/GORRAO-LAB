CREATE TABLE public.previsoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  superintendente text NOT NULL,
  mes_referencia smallint NOT NULL,
  ano_referencia smallint NOT NULL,
  semana_inicio date NOT NULL,
  semana_fim date NOT NULL,
  preciso_vendas numeric NOT NULL DEFAULT 0,
  realizado numeric NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.previsoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own previsoes or admin all" ON public.previsoes
  FOR SELECT USING ((auth.uid() = usuario_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own previsoes" ON public.previsoes
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Users update own previsoes or admin" ON public.previsoes
  FOR UPDATE USING ((auth.uid() = usuario_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users delete own previsoes or admin" ON public.previsoes
  FOR DELETE USING ((auth.uid() = usuario_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER previsoes_set_updated_at
  BEFORE UPDATE ON public.previsoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_previsoes_usuario ON public.previsoes(usuario_id);
CREATE INDEX idx_previsoes_periodo ON public.previsoes(ano_referencia, mes_referencia);