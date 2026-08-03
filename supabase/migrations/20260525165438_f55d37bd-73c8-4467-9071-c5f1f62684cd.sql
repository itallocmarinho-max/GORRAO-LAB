
DROP POLICY IF EXISTS "Delete formularios" ON public.formularios;
CREATE POLICY "Delete formularios"
ON public.formularios
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    status <> ALL (ARRAY['finalizado'::text, 'validado'::text, 'reprovado'::text])
    AND (
      auth.uid() = usuario_id
      OR is_rh_for(auth.uid(), usuario_id)
    )
  )
);

DROP POLICY IF EXISTS "Delete lancamentos when form open" ON public.lancamentos;
CREATE POLICY "Delete lancamentos when form open"
ON public.lancamentos
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'::text
      AND (f.usuario_id = auth.uid() OR is_rh_for(auth.uid(), f.usuario_id))
  )
);
