-- Adicionar tipo de formulário e campos específicos
ALTER TABLE public.formularios 
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'verba_cury',
  ADD COLUMN IF NOT EXISTS responsavel text;

-- Tornar nome_recebedor opcional (não usado em contratacao/meta)
ALTER TABLE public.lancamentos
  ALTER COLUMN nome_recebedor DROP NOT NULL;

-- Novos campos para os diferentes tipos de lançamento
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS quem_pagou text,
  ADD COLUMN IF NOT EXISTS tipo_gasto text,
  ADD COLUMN IF NOT EXISTS candidatos integer,
  ADD COLUMN IF NOT EXISTS contratados integer,
  ADD COLUMN IF NOT EXISTS gerente text,
  ADD COLUMN IF NOT EXISTS fonte text;