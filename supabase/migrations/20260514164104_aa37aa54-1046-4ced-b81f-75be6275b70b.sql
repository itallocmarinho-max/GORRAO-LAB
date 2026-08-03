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
        OR (f.tipo = 'acelera_vendas' AND f.status = 'validado')
      )
      AND (f.usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);