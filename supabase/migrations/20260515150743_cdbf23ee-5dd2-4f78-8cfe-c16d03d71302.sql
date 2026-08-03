CREATE TABLE public.gerentes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  superintendente_id uuid NOT NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (superintendente_id, nome)
);

CREATE INDEX idx_gerentes_sup ON public.gerentes(superintendente_id);

ALTER TABLE public.gerentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage all gerentes"
ON public.gerentes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superintendente view own gerentes"
ON public.gerentes
FOR SELECT
USING (auth.uid() = superintendente_id);

CREATE POLICY "Superintendente manage own gerentes"
ON public.gerentes
FOR INSERT
WITH CHECK (auth.uid() = superintendente_id);

CREATE POLICY "Superintendente update own gerentes"
ON public.gerentes
FOR UPDATE
USING (auth.uid() = superintendente_id);

CREATE POLICY "Superintendente delete own gerentes"
ON public.gerentes
FOR DELETE
USING (auth.uid() = superintendente_id);

CREATE TRIGGER tg_gerentes_updated_at
BEFORE UPDATE ON public.gerentes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();