-- Allow diretor to update formulario status (e.g., return to editing after validating/reproving)
CREATE POLICY "Diretor can update formularios status"
ON public.formularios
FOR UPDATE
USING (public.is_diretor(auth.uid()))
WITH CHECK (public.is_diretor(auth.uid()));
