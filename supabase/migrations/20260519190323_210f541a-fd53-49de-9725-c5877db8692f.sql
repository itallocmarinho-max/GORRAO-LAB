ALTER TABLE public.vendas_realizadas ALTER COLUMN unidades TYPE numeric USING unidades::numeric;
ALTER TABLE public.vendas_realizadas ALTER COLUMN unidades SET DEFAULT 1;