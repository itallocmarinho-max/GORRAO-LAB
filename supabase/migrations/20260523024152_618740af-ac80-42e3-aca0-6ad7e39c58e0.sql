
CREATE TABLE public.pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  pv text NOT NULL,
  diretor text,
  superintendente text,
  gerente text,
  corretor text,
  empreendimento text,
  ab text,
  data_criacao date,
  status text,
  diretor_id uuid,
  superintendente_id uuid,
  gerente_id uuid,
  import_batch_id uuid
);

ALTER TABLE public.pastas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pastas select" ON public.pastas
FOR SELECT USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pastas insert" ON public.pastas
FOR INSERT WITH CHECK (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pastas update" ON public.pastas
FOR UPDATE USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pastas delete" ON public.pastas
FOR DELETE USING (public.is_diretor(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_pastas_data_criacao ON public.pastas (data_criacao DESC);
CREATE INDEX idx_pastas_gerente ON public.pastas (gerente);
CREATE INDEX idx_pastas_superintendente ON public.pastas (superintendente);
CREATE INDEX idx_pastas_empreendimento ON public.pastas (empreendimento);
CREATE INDEX idx_pastas_corretor ON public.pastas (corretor);
CREATE INDEX idx_pastas_pv ON public.pastas (pv);
