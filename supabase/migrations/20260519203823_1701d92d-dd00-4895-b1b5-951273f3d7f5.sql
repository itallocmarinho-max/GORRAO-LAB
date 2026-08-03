
-- 1) Nova tabela: produtos da previsão
CREATE TABLE public.previsao_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_normalizado text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.previsao_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read previsao_produtos"
  ON public.previsao_produtos FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage previsao_produtos"
  ON public.previsao_produtos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_previsao_produtos_updated
  BEFORE UPDATE ON public.previsao_produtos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Nova tabela: aliases de produtos da previsão (aprende com importações)
CREATE TABLE public.previsao_produto_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.previsao_produtos(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalizado text NOT NULL UNIQUE,
  vezes_usado integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_previsao_produto_aliases_produto ON public.previsao_produto_aliases(produto_id);

ALTER TABLE public.previsao_produto_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read previsao_produto_aliases"
  ON public.previsao_produto_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage previsao_produto_aliases"
  ON public.previsao_produto_aliases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Adicionar produto_id em previsoes e vendas_realizadas
ALTER TABLE public.previsoes
  ADD COLUMN produto_id uuid REFERENCES public.previsao_produtos(id) ON DELETE SET NULL;

ALTER TABLE public.vendas_realizadas
  ADD COLUMN produto_id uuid REFERENCES public.previsao_produtos(id) ON DELETE SET NULL;

CREATE INDEX idx_previsoes_produto ON public.previsoes(produto_id);
CREATE INDEX idx_vendas_realizadas_produto ON public.vendas_realizadas(produto_id);
