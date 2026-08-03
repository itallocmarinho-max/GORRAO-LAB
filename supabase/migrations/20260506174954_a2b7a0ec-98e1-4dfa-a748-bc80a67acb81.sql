-- Lançamentos: bloquear qualquer alteração quando o formulário estiver validado
DROP POLICY IF EXISTS "Insert lancamentos of own forms" ON public.lancamentos;
DROP POLICY IF EXISTS "Update lancamentos of own forms or admin" ON public.lancamentos;
DROP POLICY IF EXISTS "Delete lancamentos of own forms or admin" ON public.lancamentos;

CREATE POLICY "Insert lancamentos of own forms"
ON public.lancamentos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'
      AND (f.usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Update lancamentos of own forms or admin"
ON public.lancamentos FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'
      AND (f.usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Delete lancamentos of own forms or admin"
ON public.lancamentos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'
      AND (f.usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);