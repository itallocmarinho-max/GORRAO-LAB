import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ActiveFormTypeProvider } from "@/hooks/useActiveFormType";
import { UndoButton } from "@/components/UndoButton";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { HeaderNavigationMenu } from "@/components/HeaderNavigationMenu";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const dashboardHeader = pathname === "/dashboard";
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
              <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-black px-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-sm border border-[#39FF14] flex items-center justify-center">
                    <span className="text-[#39FF14] text-[10px] font-black">G</span>
                  </div>
                  <span className="text-[11px] tracking-[0.3em] font-bold text-white/90 uppercase">
                    GORRÃO / / LAB
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <UndoButton />
                  <HeaderNavigationMenu />
                </div>
              </header>
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
