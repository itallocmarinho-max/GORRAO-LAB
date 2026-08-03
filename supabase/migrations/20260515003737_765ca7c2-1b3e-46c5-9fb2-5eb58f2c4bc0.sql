
CREATE TABLE public.leads_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  arquivo_nome text,
  total integer NOT NULL DEFAULT 0,
  auto integer NOT NULL DEFAULT 0,
  pendente integer NOT NULL DEFAULT 0,
  indefinido integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0
);

ALTER TABLE public.leads_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all import batches"
ON public.leads_import_batches
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.leads_facebook ADD COLUMN import_batch_id uuid REFERENCES public.leads_import_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_facebook_import_batch ON public.leads_facebook(import_batch_id);
