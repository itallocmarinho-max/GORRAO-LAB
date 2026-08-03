
-- 1. Add vinculado_id column to profiles (links RH to a sup or diretor)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vinculado_id uuid;

-- 2. Helper function: is current user an RH linked to this owner?
CREATE OR REPLACE FUNCTION public.is_rh_for(_uid uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _uid AND cargo = 'rh' AND vinculado_id = _owner
  )
$$;

-- 3. Update formularios policies to allow RH acting on vinculado's forms
DROP POLICY IF EXISTS "Users view own forms or admin all" ON public.formularios;
CREATE POLICY "Users view own forms or admin all" ON public.formularios
FOR SELECT USING (
  (auth.uid() = usuario_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.is_rh_for(auth.uid(), usuario_id)
);

DROP POLICY IF EXISTS "Users insert own forms" ON public.formularios;
CREATE POLICY "Users insert own forms" ON public.formularios
FOR INSERT WITH CHECK (
  (auth.uid() = usuario_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.is_rh_for(auth.uid(), usuario_id)
);

DROP POLICY IF EXISTS "Update formularios" ON public.formularios;
CREATE POLICY "Update formularios" ON public.formularios
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR ((auth.uid() = usuario_id) AND (status = 'editando'::text))
  OR ((auth.uid() = usuario_id) AND (tipo = ANY (ARRAY['planejamento'::text, 'verba_cury'::text])) AND (status = ANY (ARRAY['finalizado'::text, 'reprovado'::text])))
  OR (public.is_rh_for(auth.uid(), usuario_id) AND status = ANY (ARRAY['editando'::text, 'finalizado'::text, 'reprovado'::text]))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR ((auth.uid() = usuario_id) AND (status = ANY (ARRAY['editando'::text, 'finalizado'::text, 'validado'::text])))
  OR (public.is_rh_for(auth.uid(), usuario_id) AND status = ANY (ARRAY['editando'::text, 'finalizado'::text, 'reprovado'::text]))
);

DROP POLICY IF EXISTS "Delete formularios" ON public.formularios;
CREATE POLICY "Delete formularios" ON public.formularios
FOR DELETE USING (
  (status <> ALL (ARRAY['finalizado'::text, 'validado'::text, 'reprovado'::text]))
  AND (
    (auth.uid() = usuario_id)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR public.is_rh_for(auth.uid(), usuario_id)
  )
);

-- 4. Update lancamentos policies (via formulario_id -> formularios.usuario_id)
DROP POLICY IF EXISTS "View lancamentos of own forms or admin" ON public.lancamentos;
CREATE POLICY "View lancamentos of own forms or admin" ON public.lancamentos
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND (f.usuario_id = auth.uid() OR public.is_rh_for(auth.uid(), f.usuario_id))
  )
);

DROP POLICY IF EXISTS "Insert lancamentos when form open" ON public.lancamentos;
CREATE POLICY "Insert lancamentos when form open" ON public.lancamentos
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'::text
      AND (f.usuario_id = auth.uid() OR public.is_rh_for(auth.uid(), f.usuario_id))
  )
);

DROP POLICY IF EXISTS "Update lancamentos when form open" ON public.lancamentos;
CREATE POLICY "Update lancamentos when form open" ON public.lancamentos
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND (
        f.status = 'editando'::text
        OR (f.tipo = ANY (ARRAY['acelera_vendas'::text, 'planejamento'::text]) AND f.status = 'validado'::text)
      )
      AND (
        f.usuario_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR (public.is_rh_for(auth.uid(), f.usuario_id) AND f.status = 'editando'::text)
      )
  )
);

DROP POLICY IF EXISTS "Delete lancamentos when form open" ON public.lancamentos;
CREATE POLICY "Delete lancamentos when form open" ON public.lancamentos
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.status = 'editando'::text
      AND (
        f.usuario_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR public.is_rh_for(auth.uid(), f.usuario_id)
      )
  )
);

-- 5. Gerentes: allow RH to manage their vinculado superintendent's gerentes
DROP POLICY IF EXISTS "RH view vinculado gerentes" ON public.gerentes;
CREATE POLICY "RH view vinculado gerentes" ON public.gerentes
FOR SELECT USING (public.is_rh_for(auth.uid(), superintendente_id));

DROP POLICY IF EXISTS "RH insert vinculado gerentes" ON public.gerentes;
CREATE POLICY "RH insert vinculado gerentes" ON public.gerentes
FOR INSERT WITH CHECK (public.is_rh_for(auth.uid(), superintendente_id));

DROP POLICY IF EXISTS "RH update vinculado gerentes" ON public.gerentes;
CREATE POLICY "RH update vinculado gerentes" ON public.gerentes
FOR UPDATE USING (public.is_rh_for(auth.uid(), superintendente_id));

DROP POLICY IF EXISTS "RH delete vinculado gerentes" ON public.gerentes;
CREATE POLICY "RH delete vinculado gerentes" ON public.gerentes
FOR DELETE USING (public.is_rh_for(auth.uid(), superintendente_id));
