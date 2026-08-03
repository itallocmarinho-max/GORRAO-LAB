DROP POLICY IF EXISTS "Users insert own forms" ON public.formularios;
CREATE POLICY "Users insert own forms" ON public.formularios
FOR INSERT WITH CHECK (auth.uid() = usuario_id OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Insert lancamentos when form open" ON public.lancamentos;
CREATE POLICY "Insert lancamentos when form open" ON public.lancamentos
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'
      AND f.usuario_id = auth.uid()
  )
);