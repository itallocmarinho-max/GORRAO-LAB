import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft } from "lucide-react";
import fundoLogin from "@/assets/login-bg.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — DIRETORIA GORRÃO" },
      { name: "description", content: "Acesse sua conta na plataforma da Diretoria Gorrão para gerenciar prestação de contas e orçamentos." },
      { property: "og:title", content: "Entrar — DIRETORIA GORRÃO" },
      { property: "og:description", content: "Acesse sua conta na plataforma da Diretoria Gorrão." },
      { property: "og:url", content: "https://diretoriagorrao.lovable.app/login" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://diretoriagorrao.lovable.app/login" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else navigate({ to: "/dashboard" });
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Email de redefinição enviado");
      setForgotOpen(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white font-sans antialiased selection:bg-[#39FF14] selection:text-black flex items-center justify-center px-6">
      {/* Fundo galáxia */}
      <img
        src={fundoLogin}
        alt=""
        aria-hidden
        className="pointer-events-none select-none absolute top-0 left-0 w-screen h-auto"
      />
      {/* Grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Glow neon */}
      <div
        aria-hidden
        className="absolute -left-40 top-1/3 h-[600px] w-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(57,255,20,0.25) 0%, transparent 60%)", filter: "blur(40px)" }}
      />
      {/* Vinheta inferior */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-black" />

      {/* NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-sm border border-[#39FF14] flex items-center justify-center">
              <span className="text-[#39FF14] text-xs font-black">G</span>
            </div>
            <span className="text-xs tracking-[0.3em] font-bold text-white/90">GORRÃO // LAB</span>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[10px] tracking-[0.25em] uppercase text-white/70 hover:text-[#39FF14] transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
        </div>
      </nav>

      <div className="relative z-10 w-full max-w-md pt-16">
        <div className="text-[10px] tracking-[0.4em] uppercase text-[#39FF14] mb-4 text-center">// Acesso</div>

        <form
          onSubmit={signIn}
          className="relative border border-white/10 bg-white/[0.02] backdrop-blur-md p-8 space-y-5"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 40px rgba(57,255,20,0.08)" }}
        >
          <div>
            <label htmlFor="e1" className="block text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">Email</label>
            <input
              id="e1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-transparent border-b border-white/20 px-0 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="p1" className="block text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">Senha</label>
            <input
              id="p1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-transparent border-b border-white/20 px-0 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 text-[11px] tracking-[0.25em] uppercase border border-[#39FF14]/60 text-[#39FF14] px-4 py-3 hover:bg-[#39FF14] hover:text-black transition-all disabled:opacity-50"
            style={{ boxShadow: "0 0 20px rgba(57,255,20,0.15)" }}
          >
            {busy ? "Entrando..." : <>Entrar <ArrowRight className="h-3 w-3" /></>}
          </button>
          <button
            type="button"
            onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
            className="block w-full text-center text-[10px] tracking-[0.25em] uppercase text-white/50 hover:text-[#39FF14] transition-colors"
          >
            Esqueci minha senha
          </button>
          <p className="text-center text-[10px] tracking-[0.2em] uppercase text-white/30">
            Apenas administradores criam novos usuários
          </p>
        </form>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="bg-black border-[#39FF14]/30 text-white">
          <DialogHeader><DialogTitle>Redefinir senha</DialogTitle></DialogHeader>
          <form onSubmit={sendReset} className="space-y-3">
            <div>
              <label htmlFor="fe" className="block text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">Email cadastrado</label>
              <input
                id="fe"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                className="w-full bg-transparent border-b border-white/20 px-0 py-2 text-white focus:outline-none focus:border-[#39FF14] transition-colors"
              />
            </div>
            <DialogFooter>
              <button
                type="submit"
                disabled={forgotBusy}
                className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase border border-[#39FF14]/60 text-[#39FF14] px-4 py-2 hover:bg-[#39FF14] hover:text-black transition-all disabled:opacity-50"
              >
                {forgotBusy ? "Enviando..." : "Enviar email"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
