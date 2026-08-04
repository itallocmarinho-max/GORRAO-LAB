import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Link2, RefreshCw, Search, Sheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  vendasHierarchyDelete,
  vendasHierarchyList,
  vendasHierarchyUpsert,
  vendasSheetsList,
  vendasSheetsSync,
} from "@/functions/google-sheets-vendas.functions";

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
  const [view, setView] = useState<"vendas" | "vinculos">("vendas");
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
          (result.removed ? `; ${result.removed} removida(s)` : "") +
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === "vendas" ? "default" : "outline"}
            onClick={() => setView("vendas")}
          >
            <Sheet className="mr-2 h-4 w-4" /> Vendas
          </Button>
          <Button
            variant={view === "vinculos" ? "default" : "outline"}
            onClick={() => setView("vinculos")}
          >
            <Link2 className="mr-2 h-4 w-4" /> Vínculos
          </Button>
          {view === "vendas" && (
            <Button
              onClick={sync}
              disabled={syncing || loading}
              className="bg-[#39FF14] text-black hover:bg-[#39FF14]/80"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando…" : "Sincronizar planilha"}
            </Button>
          )}
        </div>
      </div>

      {view === "vendas" ? (
        <>
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
        </>
      ) : (
        <HierarchyPanel token={token} />
      )}
    </div>
  );
}

type HierarchyData = Awaited<ReturnType<typeof vendasHierarchyList>>;
type AliasRow = HierarchyData["diretores"][number];
type HierarquiaTipo = "diretor" | "superintendente" | "gerente";

function HierarchyPanel({ token }: { token: string }) {
  const [data, setData] = useState<HierarchyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await vendasHierarchyList({ data: { token } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar vínculos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const save = async (tipo: HierarquiaTipo, alias: string, destinoId: string) => {
    setWorking(`${tipo}:${alias}`);
    try {
      await vendasHierarchyUpsert({ data: { token, tipo, alias, destino_id: destinoId } });
      toast.success("Vínculo salvo e aplicado às vendas");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar vínculo");
    } finally {
      setWorking(null);
    }
  };

  const remove = async (tipo: HierarquiaTipo, row: AliasRow) => {
    setWorking(`${tipo}:${row.alias}`);
    try {
      await vendasHierarchyDelete({
        data: { token, tipo, alias_normalizado: row.alias_normalizado },
      });
      toast.success("Vínculo removido das vendas");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover vínculo");
    } finally {
      setWorking(null);
    }
  };

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-white/50">Carregando vínculos…</CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const directors = data.profiles.filter((profile) => profile.cargo === "diretor");
  const superintendents = data.profiles.filter((profile) => profile.cargo === "superintendente");
  const supName = new Map(superintendents.map((profile) => [profile.id, profile.nome]));
  const managerTargets = data.gerentesCadastro.map((manager) => ({
    id: manager.id,
    nome: `${manager.nome} — ${supName.get(manager.superintendente_id) ?? "sem superintendente"}`,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Vínculos da hierarquia de vendas</CardTitle>
          <CardDescription>
            Confirme quem cada nome da planilha representa no sistema. Depois de salvo, todas as
            vendas desse nome passam a usar o cadastro interno.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <LinkCount label="Diretores" rows={data.diretores} field="profile_id" />
          <LinkCount label="Superintendentes" rows={data.superintendentes} field="profile_id" />
          <LinkCount label="Gerentes" rows={data.gerentes} field="gerente_id" />
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="ml-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </CardContent>
      </Card>
      <AliasCard
        title="Diretores"
        tipo="diretor"
        rows={data.diretores}
        targets={directors}
        working={working}
        onSave={save}
        onRemove={remove}
      />
      <AliasCard
        title="Superintendentes"
        tipo="superintendente"
        rows={data.superintendentes}
        targets={superintendents}
        working={working}
        onSave={save}
        onRemove={remove}
      />
      <AliasCard
        title="Gerentes"
        tipo="gerente"
        rows={data.gerentes}
        targets={managerTargets}
        working={working}
        onSave={save}
        onRemove={remove}
      />
    </div>
  );
}

function LinkCount({
  label,
  rows,
  field,
}: {
  label: string;
  rows: AliasRow[];
  field: "profile_id" | "gerente_id";
}) {
  const linked = rows.filter((row) => Boolean(row[field])).length;
  return (
    <Badge variant="outline">
      {label}: {linked}/{rows.length} vinculados
    </Badge>
  );
}

function AliasCard({
  title,
  tipo,
  rows,
  targets,
  working,
  onSave,
  onRemove,
}: {
  title: string;
  tipo: HierarquiaTipo;
  rows: AliasRow[];
  targets: Array<{ id: string; nome: string }>;
  working: string | null;
  onSave: (tipo: HierarquiaTipo, alias: string, destinoId: string) => Promise<void>;
  onRemove: (tipo: HierarquiaTipo, row: AliasRow) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-white/10">
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-white/50">Nenhum nome encontrado na planilha.</p>
        ) : (
          rows.map((row) => (
            <AliasEditor
              key={row.alias_normalizado}
              tipo={tipo}
              row={row}
              targets={targets}
              busy={working === `${tipo}:${row.alias}`}
              onSave={onSave}
              onRemove={onRemove}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AliasEditor({
  tipo,
  row,
  targets,
  busy,
  onSave,
  onRemove,
}: {
  tipo: HierarquiaTipo;
  row: AliasRow;
  targets: Array<{ id: string; nome: string }>;
  busy: boolean;
  onSave: (tipo: HierarquiaTipo, alias: string, destinoId: string) => Promise<void>;
  onRemove: (tipo: HierarquiaTipo, row: AliasRow) => Promise<void>;
}) {
  const saved = tipo === "gerente" ? row.gerente_id : row.profile_id;
  const [value, setValue] = useState(saved ?? row.suggested_id ?? "");
  useEffect(() => setValue(saved ?? row.suggested_id ?? ""), [saved, row.suggested_id]);
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-[220px] flex-1">
        <div className="font-medium">{row.alias}</div>
        <div className="text-xs text-white/50">
          {saved
            ? "Vinculado ao cadastro interno"
            : row.suggested_id
              ? "Sugestão automática — confirme"
              : "Pendente"}
        </div>
      </div>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-[320px]">
          <SelectValue placeholder="Selecione o cadastro interno" />
        </SelectTrigger>
        <SelectContent>
          {targets.map((target) => (
            <SelectItem key={target.id} value={target.id}>
              {target.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!value || busy || value === saved}
        onClick={() => onSave(tipo, row.alias, value)}
      >
        <Check className="mr-1 h-4 w-4" /> {saved ? "Atualizar" : "Confirmar"}
      </Button>
      {saved && (
        <Button size="icon" variant="ghost" disabled={busy} onClick={() => onRemove(tipo, row)}>
          <Trash2 className="h-4 w-4 text-red-400" />
        </Button>
      )}
    </div>
  );
}
