DROP POLICY IF EXISTS "Update lancamentos of own forms or admin" ON public.lancamentos;
CREATE POLICY "Update lancamentos of own forms or admin"
ON public.lancamentos
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'
      AND f.usuario_id = auth.uid()
  )
);