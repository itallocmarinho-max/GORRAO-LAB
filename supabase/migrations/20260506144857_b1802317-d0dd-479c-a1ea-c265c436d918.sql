
-- Roles enum and table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE TABLE public.formularios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor_agilitas NUMERIC NOT NULL DEFAULT 0,
  valor_marketing NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  nome_recebedor TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  descricao TEXT,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- user_roles policies
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Formularios policies
CREATE POLICY "Users view own forms or admin all" ON public.formularios FOR SELECT
  USING (auth.uid() = usuario_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own forms" ON public.formularios FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users update own or admin" ON public.formularios FOR UPDATE
  USING (auth.uid() = usuario_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users delete own or admin" ON public.formularios FOR DELETE
  USING (auth.uid() = usuario_id OR public.has_role(auth.uid(), 'admin'));

-- Lancamentos policies
CREATE POLICY "View lancamentos of own forms or admin" ON public.lancamentos FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.usuario_id = auth.uid())
  );
CREATE POLICY "Insert lancamentos of own forms" ON public.lancamentos FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.usuario_id = auth.uid())
  );
CREATE POLICY "Update lancamentos of own forms or admin" ON public.lancamentos FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.usuario_id = auth.uid())
  );
CREATE POLICY "Delete lancamentos of own forms or admin" ON public.lancamentos FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.usuario_id = auth.uid())
  );
