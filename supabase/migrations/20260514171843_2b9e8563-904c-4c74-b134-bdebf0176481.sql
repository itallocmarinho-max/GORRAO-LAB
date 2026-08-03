DROP POLICY IF EXISTS "anexos insert own editing" ON storage.objects;
CREATE POLICY "anexos insert own editing or planejamento validado"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lancamento-anexos'
  AND EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id::text = (storage.foldername(objects.name))[1]
      AND (f.usuario_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
      AND (
        f.status = 'editando'
        OR (f.tipo = 'planejamento' AND f.status = 'validado')
      )
  )
);

DROP POLICY IF EXISTS "anexos update own editing" ON storage.objects;
CREATE POLICY "anexos update own editing or planejamento validado"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'lancamento-anexos'
  AND EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id::text = (storage.foldername(objects.name))[1]
      AND (f.usuario_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
      AND (
        f.status = 'editando'
        OR (f.tipo = 'planejamento' AND f.status = 'validado')
      )
  )
);

DROP POLICY IF EXISTS "anexos delete own editing or admin" ON storage.objects;
CREATE POLICY "anexos delete own editing or planejamento validado or admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lancamento-anexos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM formularios f
      WHERE f.id::text = (storage.foldername(objects.name))[1]
        AND f.usuario_id = auth.uid()
        AND (
          f.status = 'editando'
          OR (f.tipo = 'planejamento' AND f.status = 'validado')
        )
    )
  )
);