import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ITENS = [
  { titulo: "/ / VERBA CURY", to: "/dashboard", search: { tipo: "verba_cury" } },
  { titulo: "/ / GASTOS PESSOAIS", to: "/dashboard", search: { tipo: "gastos_pessoais" } },
  { titulo: "/ / CONTRATAÇÃO", to: "/dashboard", search: { tipo: "contratacao" } },
  { titulo: "/ / PLANEJAMENTO", to: "/dashboard", search: { tipo: "planejamento" } },
  { titulo: "/ / ACELERA VENDAS", to: "/acelera" },
  { titulo: "/ / PREVISÃO", to: "/previsao" },
] as const;

export function HeaderNavigationMenu() {
  const { role, user, nome, signOut, isDiretor, isAdmin } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });
  const [aberto, setAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fechar);
    return () => document.removeEventListener("pointerdown", fechar);
  }, [aberto]);

  const sair = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const ativo = (item: (typeof ITENS)[number]) => {
    if (pathname !== item.to) return false;
    if (!("search" in item)) return true;
    return search.tipo === item.search.tipo;
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="flex h-9 w-11 items-center justify-center border border-[#39FF14]/40 bg-black/60 text-[#39FF14] transition-all hover:border-[#39FF14] hover:bg-[#39FF14]/10"
      >
        <span className="relative block h-5 w-6" aria-hidden>
          <span className={`absolute left-1/2 top-1/2 h-[2px] w-4 -translate-x-1/2 bg-current shadow-[0_0_5px_currentColor] transition-all duration-300 ${aberto ? "-translate-y-1/2 rotate-45" : "-translate-y-[5px] rotate-0"}`} />
          <span className={`absolute left-1/2 top-1/2 h-[2px] w-4 -translate-x-1/2 bg-current shadow-[0_0_5px_currentColor] transition-all duration-300 ${aberto ? "-translate-y-1/2 -rotate-45" : "translate-y-[3px] rotate-0"}`} />
        </span>
      </button>

      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.94)",
          WebkitBackdropFilter: "blur(28px) saturate(150%)",
          backdropFilter: "blur(28px) saturate(150%)",
        }}
        className={`isolate absolute right-0 top-[calc(100%+10px)] z-[80] w-72 origin-top-right border border-[#39FF14]/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_28px_rgba(57,255,20,0.025),0_0_45px_rgba(0,0,0,0.85),0_0_28px_rgba(57,255,20,0.1)] transition-all duration-200 ${aberto ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}
      >
        <nav className="space-y-1 border-b border-white/10 pb-3">
          {ITENS.map((item) => (
            <Link
              key={item.titulo}
              to={item.to}
              search={("search" in item ? item.search : undefined) as never}
              onClick={() => setAberto(false)}
              className={`block border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition ${ativo(item) ? "border-[#39FF14]/55 bg-[#39FF14]/10 text-[#39FF14]" : "border-transparent text-white/70 hover:border-[#39FF14]/25 hover:bg-white/[0.04] hover:text-[#39FF14]"}`}
            >
              {item.titulo}
            </Link>
          ))}
          {(isDiretor || isAdmin) && (
            <Link to="/financeiro" onClick={() => setAberto(false)} className={`block border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition ${pathname === "/financeiro" ? "border-[#39FF14]/55 bg-[#39FF14]/10 text-[#39FF14]" : "border-transparent text-white/70 hover:border-[#39FF14]/25 hover:bg-white/[0.04] hover:text-[#39FF14]"}`}>
              / / FINANCEIRO
            </Link>
          )}
        </nav>

        <div className="mt-3 border border-white/10 bg-white/[0.035] p-3">
          <div className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-[#39FF14]">{nome || user?.email}</div>
          {nome && <div className="mt-1 truncate text-[9px] text-white/40">{user?.email}</div>}
          <div className="mt-3 flex gap-2">
            {role === "admin" && (
              <Link to="/admin/painel" onClick={() => setAberto(false)} className="flex h-9 flex-1 items-center justify-center gap-2 border border-[#39FF14]/30 text-[9px] font-bold uppercase tracking-wider text-[#39FF14] transition hover:bg-[#39FF14]/10">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin
              </Link>
            )}
            <button type="button" onClick={sair} className="flex h-9 flex-1 items-center justify-center gap-2 border border-white/15 text-[9px] font-bold uppercase tracking-wider text-white/60 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400">
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
