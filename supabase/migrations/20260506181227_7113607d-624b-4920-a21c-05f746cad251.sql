
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS comprovante_url text,
  ADD COLUMN IF NOT EXISTS boleto_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lancamento-anexos', 'lancamento-anexos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anexos select own or admin" ON storage.objects;
DROP POLICY IF EXISTS "anexos insert own editing" ON storage.objects;
DROP POLICY IF EXISTS "anexos update own editing" ON storage.objects;
DROP POLICY IF EXISTS "anexos delete own editing or admin" ON storage.objects;

-- Path convention: {formulario_id}/{lancamento_id}/{tipo}-{filename}
CREATE POLICY "anexos select own or admin"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lancamento-anexos' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id::text = (storage.foldername(name))[1]
        AND f.usuario_id = auth.uid()
    )
  )
);

CREATE POLICY "anexos insert own editing"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lancamento-anexos' AND EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id::text = (storage.foldername(name))[1]
      AND f.status = 'editando'
      AND (f.usuario_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "anexos update own editing"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'lancamento-anexos' AND EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id::text = (storage.foldername(name))[1]
      AND f.status = 'editando'
      AND (f.usuario_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "anexos delete own editing or admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lancamento-anexos' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id::text = (storage.foldername(name))[1]
        AND f.status = 'editando'
        AND f.usuario_id = auth.uid()
    )
  )
);
