import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck, Rocket } from "lucide-react";

export function AppNav() {
  const { role, user, nome, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
          <span>DIRETORIA GORRÃO</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "px-3 py-1.5 text-sm font-medium text-foreground" }}
          >
            Nova Prestação
          </Link>
          <Link
            to="/acelera"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-foreground" }}
          >
            <Rocket className="h-4 w-4" /> Acelera Vendas
          </Link>
          {role === "admin" && (
            <Button asChild size="sm" variant="default">
              <Link to="/admin">
                <ShieldCheck className="h-4 w-4" /> Painel Admin
              </Link>
            </Button>
          )}
          <span className="ml-3 hidden text-xs text-muted-foreground md:inline">
            {nome ? <><span className="font-medium text-foreground">{nome}</span> · {user?.email}</> : user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}
