import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Role = "admin" | "user" | null;
type Cargo = "diretor" | "superintendente" | "administrador" | "rh" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  nome: string | null;
  cargo: Cargo;
  isAdmin: boolean;
  isDiretor: boolean;
  isRH: boolean;
  vinculadoId: string | null;
  canEdit: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  role: null,
  nome: null,
  cargo: null,
  isAdmin: false,
  isDiretor: false,
  isRH: false,
  vinculadoId: null,
  canEdit: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [cargo, setCargo] = useState<Cargo>(null);
  const [vinculadoId, setVinculadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuthState = () => {
    setSession(null);
    setUser(null);
    setRole(null);
    setNome(null);
    setCargo(null);
    setVinculadoId(null);
  };

  useEffect(() => {
    const INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 horas
    const KEY = "lastActivityAt";
    const last = Number(localStorage.getItem(KEY) || 0);
    const expired = last && Date.now() - last > INACTIVITY_MS;
    if (expired) {
      localStorage.removeItem(KEY);
      supabase.auth.signOut().finally(() => {
        clearAuthState();
        setLoading(false);
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      });
      return;
    }
    const bump = () => localStorage.setItem(KEY, String(Date.now()));
    bump();
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    let t: number | null = null;
    const onActivity = () => {
      if (t) return;
      t = window.setTimeout(() => { bump(); t = null; }, 5000);
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchRole(s.user.id), 0);
        setTimeout(() => fetchProfile(s.user.id), 0);
      } else {
        clearAuthState();
      }
    });
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) {
        await supabase.auth.signOut({ scope: "local" });
        clearAuthState();
        setLoading(false);
        return;
      }

      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      setUser(data.user);
      await Promise.all([fetchRole(data.user.id), fetchProfile(data.user.id)]);
      setLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (t) window.clearTimeout(t);
    };
  }, []);

  const fetchRole = async (uid: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .order("role", { ascending: true });
    if (data && data.length) {
      const isAdmin = data.some((r) => r.role === "admin");
      setRole(isAdmin ? "admin" : "user");
    } else {
      setRole("user");
    }
  };

  const fetchProfile = async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("nome, cargo, vinculado_id")
      .eq("id", uid)
      .maybeSingle();
    setNome((data as any)?.nome ?? null);
    setCargo(((data as any)?.cargo ?? null) as Cargo);
    setVinculadoId(((data as any)?.vinculado_id ?? null) as string | null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = role === "admin";
  const isDiretor = cargo === "diretor";
  const isRH = cargo === "rh";
  const canEdit = isAdmin && !isDiretor;

  return (
    <Ctx.Provider value={{ user, session, role, nome, cargo, isAdmin, isDiretor, isRH, vinculadoId, canEdit, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
