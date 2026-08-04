import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { vendasSheetsList, vendasSheetsSync } from "@/functions/google-sheets-vendas.functions";

export const Route = createFileRoute("/_app/admin/vendas")({ component: AdminVendas });

type Venda = Awaited<ReturnType<typeof vendasSheetsList>>[number];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function AdminVendas() {
  const { role, loading: authLoading, session } = useAuth();
  const [rows, setRows] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const token = session?.access_token ?? "";

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      setRows(await vendasSheetsList({ data: { token } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as vendas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === "admin" && token) void load();
    else if (!authLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, token, authLoading]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.proposta_identificador,
        row.status,
        row.empreendimento,
        row.unidade,
        row.diretor,
        row.superintendente,
        row.gerente,
        row.corretor,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [query, rows]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await vendasSheetsSync({ data: { token } });
      toast.success(
        `${result.synchronized} venda(s) sincronizada(s)` +
          (result.ignored ? `; ${result.ignored} linha(s) ignorada(s)` : ""),
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar a planilha");
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading) return null;
  if (role !== "admin") return <div className="p-6">Acesso restrito.</div>;

  const lastSync = rows.reduce<string | null>(
    (latest, row) => (!latest || row.sincronizado_em > latest ? row.sincronizado_em : latest),
    null,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-3 text-white/70">
            <Link to="/admin/painel">
              <ArrowLeft className="mr-1 h-4 w-4" /> Painel
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/10 text-[#39FF14]">
              <Sheet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
              <p className="text-sm text-white/60">
                Dados importados da aba Vendas do Google Sheets
              </p>
            </div>
          </div>
        </div>
        <Button
          onClick={sync}
          disabled={syncing || loading}
          className="bg-[#39FF14] text-black hover:bg-[#39FF14]/80"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando…" : "Sincronizar planilha"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de vendas</CardDescription>
            <CardTitle>{rows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Exibidas no filtro</CardDescription>
            <CardTitle>{filtered.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Última sincronização</CardDescription>
            <CardTitle className="text-base">
              {lastSync ? new Date(lastSync).toLocaleString("pt-BR") : "Ainda não realizada"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vendas sincronizadas</CardTitle>
          <CardDescription>
            A planilha é somente leitura; a sincronização atualiza registros pela proposta.
          </CardDescription>
          <div className="relative max-w-xl pt-2">
            <Search className="absolute left-3 top-5 h-4 w-4 text-white/40" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar proposta, empreendimento ou equipe…"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/50">
                <th className="px-3 py-3">Proposta</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Assinatura</th>
                <th className="px-3 py-3">Empreendimento</th>
                <th className="px-3 py-3">Unidade</th>
                <th className="px-3 py-3">Diretor</th>
                <th className="px-3 py-3">Superintendente</th>
                <th className="px-3 py-3">Gerente</th>
                <th className="px-3 py-3">Corretor</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-white/50">
                    Carregando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-white/50">
                    Nenhuma venda encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.proposta_identificador}
                    className="border-b border-white/5 hover:bg-white/[0.03]"
                  >
                    <td className="px-3 py-3 font-medium text-[#39FF14]">
                      {row.proposta_identificador}
                    </td>
                    <td className="px-3 py-3">
                      {row.status ? <Badge variant="outline">{row.status}</Badge> : "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDate(row.data_assinatura)}
                    </td>
                    <td className="px-3 py-3">{row.empreendimento || "—"}</td>
                    <td className="px-3 py-3">
                      {[row.torre, row.unidade].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-3 py-3">{row.diretor || "—"}</td>
                    <td className="px-3 py-3">{row.superintendente || "—"}</td>
                    <td className="px-3 py-3">{row.gerente || "—"}</td>
                    <td className="px-3 py-3">{row.corretor || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
