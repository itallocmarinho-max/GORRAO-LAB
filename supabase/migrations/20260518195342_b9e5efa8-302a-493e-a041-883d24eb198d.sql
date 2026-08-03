ALTER TABLE public.leads_facebook
ADD COLUMN IF NOT EXISTS contagem integer NOT NULL DEFAULT 1;