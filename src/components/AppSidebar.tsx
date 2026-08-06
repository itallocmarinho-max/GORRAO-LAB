import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import gorraoLogo from "@/assets/gorrao-logo.png";
import sidebarBgVideo from "@/assets/sidebar-bg.mp4";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useActiveFormType } from "@/hooks/useActiveFormType";
import { LogOut, ShieldCheck } from "lucide-react";

type Item = {
  title: string;
  to: string;
  search?: Record<string, string>;
  adminOnly?: boolean;
  comingSoonForUsers?: boolean;
};

const FORM_ITEMS: Item[] = [
  { title: "/ / VERBA CURY", to: "/dashboard", search: { tipo: "verba_cury" } },
  { title: "/ / GASTOS PESSOAIS", to: "/dashboard", search: { tipo: "gastos_pessoais" } },
  { title: "/ / CONTRATAÇÃO", to: "/dashboard", search: { tipo: "contratacao" } },
  { title: "/ / PLANEJAMENTO", to: "/dashboard", search: { tipo: "planejamento" } },
  { title: "/ / ACELERA VENDAS", to: "/acelera" },
  { title: "/ / PREVISÃO", to: "/previsao", comingSoonForUsers: true },
];

type DirectorItem = Item & { directorOrAdmin?: boolean };
const DIRETOR_ITEMS: DirectorItem[] = [
  { title: "/ / FINANCEIRO", to: "/financeiro", directorOrAdmin: true },
];

export function AppSidebar() {
  const { role, user, nome, signOut, isDiretor, isAdmin, cargo } = useAuth();
  const isSuperintendente = cargo === "superintendente";
  const { activeFormType } = useActiveFormType();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const isVerbaCury =
    pathname === "/dashboard" &&
    (search?.tipo === "verba_cury" ||
      search?.tipo === "planejamento" ||
      search?.tipo === "gastos_pessoais");
  const itemClass = (it: Item) => (isActive(it) ? "text-[#39FF14]" : "text-white");

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const isActive = (it: Item) => {
    if (it.search) {
      if (pathname === it.to) {
        return Object.entries(it.search).every(([k, v]) => String(search?.[k] ?? "") === v);
      }
      // Se estamos em /formularios/$id e o activeFormType bate com o search tipo, marca como ativo
      if (pathname.startsWith("/formularios/") && activeFormType) {
        return Object.entries(it.search).every(([k, v]) => k === "tipo" && activeFormType === v);
      }
      return false;
    }
    if (pathname === it.to) return true;
    return false;
  };

  const visible = (items: Item[]) =>
    items.filter((i) => {
      if (i.search?.tipo === "contratacao") return true;
      if (i.adminOnly) return role === "admin";
      if (i.to === "/leads" && role === "admin") return false;
      // Superintendente não vê Usuários nem Painel de Controle (nem como "Em breve")
      if (isSuperintendente && (i.to === "/admin/usuarios" || i.to === "/admin/painel"))
        return false;
      return true;
    });

  const showFinanceiro = isDiretor || isAdmin;

  return (
    <Sidebar
      collapsible="icon"
      className="[&_[data-sidebar=sidebar]]:relative [&_[data-sidebar=sidebar]]:overflow-hidden [&_[data-sidebar=sidebar]]:!bg-transparent [&_[data-sidebar=sidebar]]:border-r [&_[data-sidebar=sidebar]]:border-[#39FF14]/30"
    >
      <video
        src={sidebarBgVideo}
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover -z-10"
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-black/40 backdrop-blur-xl" />
      <SidebarHeader className="flex-row items-center gap-1 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex min-w-0 flex-1 items-center justify-center p-0">
          <img
            src={gorraoLogo}
            alt="Diretoria Gorrão Cury"
            className="w-full h-auto object-contain group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible(FORM_ITEMS).map((it) => (
                <SidebarMenuItem key={it.title}>
                  {it.comingSoonForUsers &&
                  it.search?.tipo !== "contratacao" &&
                  role !== "admin" ? (
                    <SidebarMenuButton
                      disabled
                      tooltip={`${it.title} — Em breve`}
                      className={`opacity-60 cursor-not-allowed ${itemClass(it)}`}
                    >
                      <span className={itemClass(it)}>{it.title}</span>
                      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">
                        Em breve
                      </span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(it)}
                      tooltip={it.title}
                      className={itemClass(it)}
                    >
                      <Link to={it.to} search={it.search as never}>
                        <span className={itemClass(it)}>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
              {DIRETOR_ITEMS.map((it) => {
                const canAccess = showFinanceiro;
                const showAsComingSoon = it.comingSoonForUsers && role !== "admin";
                if (!canAccess && !showAsComingSoon) return null;
                return (
                  <SidebarMenuItem key={it.title}>
                    {showAsComingSoon ? (
                      <SidebarMenuButton
                        disabled
                        tooltip={`${it.title} — Em breve`}
                        className={`opacity-60 cursor-not-allowed ${itemClass(it)}`}
                      >
                        <span className={itemClass(it)}>{it.title}</span>
                        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">
                          Em breve
                        </span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(it)}
                        tooltip={it.title}
                        className={itemClass(it)}
                      >
                        <Link to={it.to}>
                          <span className={itemClass(it)}>{it.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="min-w-0 flex-1 text-xs text-[#39FF14]/80 group-data-[collapsible=icon]:hidden">
            <div className="truncate font-medium text-[#39FF14]">{nome || user?.email}</div>
            {nome && <div className="truncate text-[#39FF14]/60">{user?.email}</div>}
          </div>
          {role === "admin" && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="text-[#39FF14] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              title="Admin"
            >
              <Link to="/admin/painel">
                <ShieldCheck className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-[#39FF14] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
