CREATE POLICY "RH can view vinculado profile"
  ON public.profiles FOR SELECT
  USING (public.is_rh_for(auth.uid(), id));