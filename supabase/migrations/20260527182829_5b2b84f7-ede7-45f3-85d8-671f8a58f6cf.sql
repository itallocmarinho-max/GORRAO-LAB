
-- lancamentos UPDATE: incluir RH vinculado para planejamento validado / acelera
DROP POLICY IF EXISTS "Update lancamentos when form open" ON public.lancamentos;
CREATE POLICY "Update lancamentos when form open"
ON public.lancamentos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND (
        f.status = 'editando'
        OR (f.tipo = ANY (ARRAY['acelera_vendas','planejamento']) AND f.status = 'validado')
      )
      AND (
        f.usuario_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR (is_rh_for(auth.uid(), f.usuario_id) AND f.status = 'editando')
        OR (is_rh_for(auth.uid(), f.usuario_id) AND f.tipo = ANY (ARRAY['acelera_vendas','planejamento']) AND f.status = 'validado')
      )
  )
);

-- storage policies: incluir is_rh_for
DROP POLICY IF EXISTS "anexos select own or admin" ON storage.objects;
CREATE POLICY "anexos select own or admin"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lancamento-anexos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id::text = (storage.foldername(storage.objects.name))[1]
        AND (f.usuario_id = auth.uid() OR is_rh_for(auth.uid(), f.usuario_id))
    )
  )
);

DROP POLICY IF EXISTS "anexos insert own editing or planejamento validado" ON storage.objects;
CREATE POLICY "anexos insert own editing or planejamento validado"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lancamento-anexos'
  AND EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id::text = (storage.foldername(storage.objects.name))[1]
      AND (
        f.usuario_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR is_rh_for(auth.uid(), f.usuario_id)
      )
      AND (
        f.status = 'editando'
        OR (f.tipo = 'planejamento' AND f.status = 'validado')
      )
  )
);

DROP POLICY IF EXISTS "anexos update own editing or planejamento validado" ON storage.objects;
CREATE POLICY "anexos update own editing or planejamento validado"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'lancamento-anexos'
  AND EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id::text = (storage.foldername(storage.objects.name))[1]
      AND (
        f.usuario_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR is_rh_for(auth.uid(), f.usuario_id)
      )
      AND (
        f.status = 'editando'
        OR (f.tipo = 'planejamento' AND f.status = 'validado')
      )
  )
);

DROP POLICY IF EXISTS "anexos delete own editing or planejamento validado or admin" ON storage.objects;
CREATE POLICY "anexos delete own editing or planejamento validado or admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lancamento-anexos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id::text = (storage.foldername(storage.objects.name))[1]
        AND (f.usuario_id = auth.uid() OR is_rh_for(auth.uid(), f.usuario_id))
        AND (
          f.status = 'editando'
          OR (f.tipo = 'planejamento' AND f.status = 'validado')
        )
    )
  )
);
