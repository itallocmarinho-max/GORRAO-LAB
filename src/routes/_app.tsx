import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ActiveFormTypeProvider, useActiveFormType } from "@/hooks/useActiveFormType";
import { UndoButton } from "@/components/UndoButton";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { HeaderNavigationMenu } from "@/components/HeaderNavigationMenu";
import { tipoLabel } from "@/lib/form-types";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppHeader({ formulario }: { formulario: boolean }) {
  const { activeFormType } = useActiveFormType();
  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-[#39FF14]/20 bg-black/95 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2 justify-self-start">
        <div className="flex h-6 w-6 items-center justify-center border border-[#39FF14]">
          <span className="text-[10px] font-black text-[#39FF14]">G</span>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/90">GORRÃO <span className="text-[#39FF14]">/ /</span> LAB</span>
      </div>
      {formulario && activeFormType && (
        <h1 className="justify-self-center text-xs font-bold uppercase tracking-[0.35em] text-[#39FF14]">
          {tipoLabel(activeFormType).replace(/^\/\/\s*/, "")}
        </h1>
      )}
      <div className="flex items-center gap-2 justify-self-end">
        <UndoButton />
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
            {!dashboardHeader && (
              <AppHeader formulario={formularioHeader} />
            )}
            <main
              className={`verba-cyber relative bg-black overflow-hidden ${dashboardHeader ? "min-h-screen" : "min-h-[calc(100vh-3.5rem)]"}`}
            >
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
