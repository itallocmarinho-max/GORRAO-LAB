import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ActiveFormTypeProvider } from "@/hooks/useActiveFormType";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { UndoButton } from "@/components/UndoButton";
import { CyberBackdrop } from "@/components/CyberBackdrop";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
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
      <SidebarProvider
        style={
          {
            "--sidebar": "rgba(0,0,0,0.35)",
            "--sidebar-foreground": "#ffffff",
            "--sidebar-primary": "#39FF14",
            "--sidebar-primary-foreground": "#000000",
            "--sidebar-accent": "rgba(57,255,20,0.12)",
            "--sidebar-accent-foreground": "#39FF14",
            "--sidebar-border": "rgba(255,255,255,0.08)",
            "--sidebar-ring": "rgba(57,255,20,0.4)",
          } as React.CSSProperties
        }
      >
        <div className="flex min-h-screen w-full bg-black text-white">
          <AppSidebar />
          <SidebarInset className="bg-black">
            <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-black px-4">
              <SidebarTrigger className="text-white/80 hover:text-[#39FF14]" />
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-sm border border-[#39FF14] flex items-center justify-center">
                  <span className="text-[#39FF14] text-[10px] font-black">G</span>
                </div>
                <span className="text-[11px] tracking-[0.3em] font-bold text-white/90 uppercase">
                  GORRÃO // LAB
                </span>
              </div>
              <div className="ml-auto">
                <UndoButton />
              </div>
            </header>
            <main className="verba-cyber relative min-h-[calc(100vh-3.5rem)] bg-black overflow-hidden">
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
                  background:
                    "radial-gradient(circle, rgba(57,255,20,0.15) 0%, transparent 60%)",
                  filter: "blur(40px)",
                }}
              />
              <div className="relative z-10 w-full px-6 py-8">
                <Outlet />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ActiveFormTypeProvider>
  );
}
