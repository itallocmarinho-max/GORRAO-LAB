DROP POLICY IF EXISTS "Users update own or admin" ON public.formularios;
CREATE POLICY "Users update own or admin" ON public.formularios FOR UPDATE
  USING (
    ((auth.uid() = usuario_id) AND (status <> 'validado'))
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (
      (auth.uid() = usuario_id)
      AND status IN ('editando', 'finalizado')
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );