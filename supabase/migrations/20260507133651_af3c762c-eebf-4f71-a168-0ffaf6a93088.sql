
-- Lock formularios after finalizado/validado for everyone (incl. admin)
DROP POLICY IF EXISTS "Users update own or admin" ON public.formularios;
DROP POLICY IF EXISTS "Users delete own or admin" ON public.formularios;

CREATE POLICY "Update formularios when not locked"
ON public.formularios FOR UPDATE
USING (
  status NOT IN ('finalizado','validado')
  AND ((auth.uid() = usuario_id) OR has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  ((auth.uid() = usuario_id) AND status IN ('editando','finalizado'))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Delete formularios when not locked"
ON public.formularios FOR DELETE
USING (
  status NOT IN ('finalizado','validado')
  AND ((auth.uid() = usuario_id) OR has_role(auth.uid(), 'admin'::app_role))
);

-- Lock lancamentos when parent form is finalizado/validado
DROP POLICY IF EXISTS "Update lancamentos of own forms or admin" ON public.lancamentos;
DROP POLICY IF EXISTS "Delete lancamentos of own forms or admin" ON public.lancamentos;
DROP POLICY IF EXISTS "Insert lancamentos of own forms" ON public.lancamentos;

CREATE POLICY "Insert lancamentos when form open"
ON public.lancamentos FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.formularios f
  WHERE f.id = lancamentos.formulario_id
    AND f.status = 'editando'
    AND ((f.usuario_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Update lancamentos when form open"
ON public.lancamentos FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.formularios f
  WHERE f.id = lancamentos.formulario_id
    AND f.status = 'editando'
    AND ((f.usuario_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Delete lancamentos when form open"
ON public.lancamentos FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.formularios f
  WHERE f.id = lancamentos.formulario_id
    AND f.status = 'editando'
    AND ((f.usuario_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
));
