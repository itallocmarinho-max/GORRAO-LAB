
CREATE TABLE public.plantoes_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano smallint NOT NULL,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, mes, nome)
);

CREATE INDEX idx_plantoes_mes_ano_mes ON public.plantoes_mes(ano, mes);

ALTER TABLE public.plantoes_mes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view plantoes_mes"
ON public.plantoes_mes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins manage plantoes_mes"
ON public.plantoes_mes FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
