
-- Função utilitária para normalizar texto (lowercase, sem acento, espaços únicos)
CREATE OR REPLACE FUNCTION public.normalize_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(
    lower(translate(coalesce(input,''),
      'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
      'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
    )),
    '[^a-z0-9 ]+', ' ', 'g'
  ));
$$;

-- Habilitar pg_trgm para similaridade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.produtos_oficiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_normalizado text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome_normalizado)
);

CREATE INDEX idx_produtos_nome_trgm ON public.produtos_oficiais USING gin (nome_normalizado gin_trgm_ops);

CREATE TABLE public.produto_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos_oficiais(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalizado text NOT NULL,
  vezes_usado integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_normalizado)
);

CREATE INDEX idx_aliases_norm_trgm ON public.produto_aliases USING gin (alias_normalizado gin_trgm_ops);
CREATE INDEX idx_aliases_produto ON public.produto_aliases(produto_id);

CREATE TABLE public.leads_facebook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_original text NOT NULL,
  nome_normalizado text NOT NULL,
  campanha text,
  formulario text,
  payload jsonb,
  produto_id uuid REFERENCES public.produtos_oficiais(id) ON DELETE SET NULL,
  produto_sugerido_id uuid REFERENCES public.produtos_oficiais(id) ON DELETE SET NULL,
  score numeric(5,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente', -- pendente | aprovado_auto | aprovado_manual | indefinido
  origem_decisao text, -- automatica | manual
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_status ON public.leads_facebook(status);
CREATE INDEX idx_leads_produto ON public.leads_facebook(produto_id);

CREATE TABLE public.leads_decisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads_facebook(id) ON DELETE CASCADE,
  acao text NOT NULL, -- classificou_auto | confirmou | trocou_produto | criou_alias | criou_produto | marcou_indefinido
  produto_id uuid REFERENCES public.produtos_oficiais(id) ON DELETE SET NULL,
  alias_id uuid REFERENCES public.produto_aliases(id) ON DELETE SET NULL,
  score numeric(5,4),
  origem text NOT NULL, -- automatica | manual
  usuario_id uuid,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_decisoes_lead ON public.leads_decisoes(lead_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_produtos_updated_at
BEFORE UPDATE ON public.produtos_oficiais
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS
ALTER TABLE public.produtos_oficiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_facebook ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_decisoes ENABLE ROW LEVEL SECURITY;

-- Apenas admin
CREATE POLICY "admin all produtos" ON public.produtos_oficiais
FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "admin all aliases" ON public.produto_aliases
FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "admin all leads" ON public.leads_facebook
FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "admin all decisoes" ON public.leads_decisoes
FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
