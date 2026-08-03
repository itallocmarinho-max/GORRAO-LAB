
-- Add status column to formularios
ALTER TABLE public.formularios
  ADD COLUMN status text NOT NULL DEFAULT 'editando'
  CHECK (status IN ('editando', 'finalizado', 'validado'));

-- Drop old RLS to recreate with status checks
DROP POLICY IF EXISTS "Users update own or admin" ON public.formularios;
DROP POLICY IF EXISTS "Users delete own or admin" ON public.formularios;

-- User can update own form if not validado; admin can always update
CREATE POLICY "Users update own or admin"
ON public.formularios
FOR UPDATE
USING (
  (auth.uid() = usuario_id AND status <> 'validado')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- User can delete own form if not validado; admin can always delete
CREATE POLICY "Users delete own or admin"
ON public.formularios
FOR DELETE
USING (
  (auth.uid() = usuario_id AND status <> 'validado')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Lancamentos: block insert/update/delete when form is finalizado or validado (unless admin)
DROP POLICY IF EXISTS "Insert lancamentos of own forms" ON public.lancamentos;
DROP POLICY IF EXISTS "Update lancamentos of own forms or admin" ON public.lancamentos;
DROP POLICY IF EXISTS "Delete lancamentos of own forms or admin" ON public.lancamentos;

CREATE POLICY "Insert lancamentos of own forms"
ON public.lancamentos
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.usuario_id = auth.uid()
      AND f.status = 'editando'
  )
);

CREATE POLICY "Update lancamentos of own forms or admin"
ON public.lancamentos
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.usuario_id = auth.uid()
      AND f.status = 'editando'
  )
);

CREATE POLICY "Delete lancamentos of own forms or admin"
ON public.lancamentos
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM formularios f
    WHERE f.id = lancamentos.formulario_id
      AND f.usuario_id = auth.uid()
      AND f.status = 'editando'
  )
);
