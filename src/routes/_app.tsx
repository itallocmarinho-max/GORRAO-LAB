import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ActiveFormTypeProvider, useActiveFormType } from "@/hooks/useActiveFormType";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { HeaderNavigationMenu } from "@/components/HeaderNavigationMenu";
import { tipoLabel } from "@/lib/form-types";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppHeader({ formulario, tituloFixo }: { formulario: boolean; tituloFixo?: string }) {
  const { activeFormType } = useActiveFormType();
  const titulo =
    tituloFixo ||
    (formulario && activeFormType ? tipoLabel(activeFormType).replace(/^\/\/\s*/, "") : null);
  return (
    <header className="sticky top-0 z-40 isolate grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-[#39FF14]/30 bg-transparent px-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-[42px]">
      <video
        aria-hidden
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="pointer-events-none absolute inset-0 -z-20 h-full w-full scale-105 object-cover opacity-55"
      >
        <source src="/header-background.mp4" type="video/mp4" />
      </video>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-white/[0.035] backdrop-blur-[42px] backdrop-saturate-150"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-px bg-[#39FF14] shadow-[0_0_8px_1px_rgba(57,255,20,0.55)]"
      />
      <div className="relative z-10 flex items-center gap-2 justify-self-start">
        <div className="flex h-6 w-6 items-center justify-center border border-[#39FF14]">
          <span className="text-[10px] font-black text-[#39FF14]">G</span>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/90">
          GORRÃO <span className="text-[#39FF14]">/ /</span> LAB
        </span>
      </div>
      {titulo && (
        <h1 className="relative z-10 justify-self-center text-xs font-bold uppercase tracking-[0.35em] text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.45)]">
          {titulo}
        </h1>
      )}
      <div className="relative z-10 flex items-center gap-2 justify-self-end">
        <HeaderNavigationMenu />
      </div>
    </header>
  );
}

function AppLayout() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const dashboardHeader = pathname === "/dashboard";
  const formularioHeader = pathname.startsWith("/formularios/");
  const tituloFixo = pathname.startsWith("/inicio")
    ? "INÍCIO"
    : pathname.startsWith("/acelera")
      ? "ACELERA VENDAS"
      : pathname.startsWith("/previsao")
        ? "PREVISÃO"
        : pathname.startsWith("/financeiro")
          ? "FINANCEIRO"
          : pathname.startsWith("/pastas")
            ? "PASTAS"
            : pathname.startsWith("/admin/painel")
              ? "PAINEL DE CONTROLE"
              : undefined;
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <ActiveFormTypeProvider>
      <div className="min-h-screen w-full bg-black text-white">
        <AppHeader formulario={formularioHeader || dashboardHeader} tituloFixo={tituloFixo} />
        <main className="verba-cyber relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-black">
          <CyberBackdrop />
          {/* grid sutil de fundo */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          {/* glow neon */}
          <div
            aria-hidden
            className="pointer-events-none fixed -left-40 top-1/3 h-[600px] w-[600px] rounded-full z-0"
            style={{
              background: "radial-gradient(circle, rgba(57,255,20,0.15) 0%, transparent 60%)",
              filter: "blur(40px)",
            }}
          />
          <div className="relative z-10 w-full px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </ActiveFormTypeProvider>
  );
}
