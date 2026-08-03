
DROP POLICY IF EXISTS "Update formularios when not locked" ON public.formularios;
DROP POLICY IF EXISTS "Delete formularios when not locked" ON public.formularios;

CREATE POLICY "Update formularios"
ON public.formularios FOR UPDATE
USING (
  status NOT IN ('validado','reprovado')
  AND (
    (auth.uid() = usuario_id AND status = 'editando')
    OR has_role(auth.uid(), 'admin'::app_role)
  )
)
WITH CHECK (
  (auth.uid() = usuario_id AND status IN ('editando','finalizado'))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Delete formularios"
ON public.formularios FOR DELETE
USING (
  status NOT IN ('finalizado','validado','reprovado')
  AND ((auth.uid() = usuario_id) OR has_role(auth.uid(), 'admin'::app_role))
);
