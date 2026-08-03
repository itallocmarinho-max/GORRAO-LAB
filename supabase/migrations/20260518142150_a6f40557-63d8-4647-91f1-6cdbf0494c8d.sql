DROP POLICY IF EXISTS "Update formularios" ON public.formularios;

CREATE POLICY "Update formularios" ON public.formularios
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (auth.uid() = usuario_id AND status = 'editando')
  OR (auth.uid() = usuario_id AND tipo = 'planejamento' AND status IN ('finalizado','reprovado'))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (auth.uid() = usuario_id AND status = ANY (ARRAY['editando','finalizado','validado']))
);