import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PastasOverview } from "@/components/PastasOverview";
import { VendasHierarchyPanel } from "@/components/VendasHierarchyPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  pastasSheetsList,
  pastasSheetsSync,
  type PastaVolumeRow,
} from "@/functions/google-sheets-pastas.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/pastas")({ component: PastasPage });

const ALL = "__all";

type SummaryRow = {
  name: string;
  total: number;
  withAb: number;
  withoutAb: number;
  rate: number;
};

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
}

function summarize(rows: PastaVolumeRow[], field: keyof PastaVolumeRow): SummaryRow[] {
  const groups = new Map<string, { total: number; withAb: number }>();
  for (const row of rows) {
    const name = String(row[field] ?? "").trim() || "Não informado";
    const current = groups.get(name) ?? { total: 0, withAb: 0 };
    current.total += 1;
    if (row.tem_ab) current.withAb += 1;
    groups.set(name, current);
  }
  return [...groups.entries()]
    .map(([name, values]) => ({
      name,
      total: values.total,
      withAb: values.withAb,
      withoutAb: values.total - values.withAb,
      rate: values.total ? (values.withAb / values.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function PastasPage() {
  const { isAdmin, isDiretor, loading: authLoading, session } = useAuth();
  const navigate = useNavigate();
  const token = session?.access_token ?? "";
  const [rows, setRows] = useState<PastaVolumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingAb, setPendingAb] = useState(0);
  const [abStored, setAbStored] = useState(0);
  const [linksOpen, setLinksOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  const [directorFilter, setDirectorFilter] = useState(ALL);
  const [superFilter, setSuperFilter] = useState(ALL);
  const [managerFilter, setManagerFilter] = useState(ALL);
  const [enterpriseFilter, setEnterpriseFilter] = useState(ALL);
  const [abFilter, setAbFilter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin && !isDiretor) navigate({ to: "/dashboard" });
  }, [authLoading, isAdmin, isDiretor, navigate]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await pastasSheetsList({ data: { token } });
      setRows(result.rows);
      setLastSync(result.lastSync);
      setPendingAb(result.pendingAb);
      setAbStored(result.abTotal);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar Pastas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && token && (isAdmin || isDiretor)) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, token, isAdmin, isDiretor]);

  const directors = useMemo(() => unique(rows.map((row) => row.diretor)), [rows]);
  const supers = useMemo(
    () =>
      unique(
        rows
          .filter((row) => directorFilter === ALL || row.diretor === directorFilter)
          .map((row) => row.superintendente),
      ),
    [rows, directorFilter],
  );
  const managers = useMemo(
    () =>
      unique(
        rows
          .filter(
            (row) =>
              (directorFilter === ALL || row.diretor === directorFilter) &&
              (superFilter === ALL || row.superintendente === superFilter),
          )
          .map((row) => row.gerente),
      ),
    [rows, directorFilter, superFilter],
  );
  const enterprises = useMemo(() => unique(rows.map((row) => row.empreendimento)), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (directorFilter !== ALL && row.diretor !== directorFilter) return false;
        if (superFilter !== ALL && row.superintendente !== superFilter) return false;
        if (managerFilter !== ALL && row.gerente !== managerFilter) return false;
        if (enterpriseFilter !== ALL && row.empreendimento !== enterpriseFilter) return false;
        if (abFilter === "with" && !row.tem_ab) return false;
        if (abFilter === "without" && row.tem_ab) return false;
        if (dateFrom && (!row.data_criacao || row.data_criacao < dateFrom)) return false;
        if (dateTo && (!row.data_criacao || row.data_criacao > dateTo)) return false;
        return true;
      }),
    [
      rows,
      directorFilter,
      superFilter,
      managerFilter,
      enterpriseFilter,
      abFilter,
      dateFrom,
      dateTo,
    ],
  );

  const byManager = useMemo(() => summarize(filtered, "gerente"), [filtered]);
  const byEnterprise = useMemo(() => summarize(filtered, "empreendimento"), [filtered]);

  const clearFilters = () => {
    setDirectorFilter(ALL);
    setSuperFilter(ALL);
    setManagerFilter(ALL);
    setEnterpriseFilter(ALL);
    setAbFilter(ALL);
    setDateFrom("");
    setDateTo("");
  };

  const sync = async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const result = await pastasSheetsSync({ data: { token } });
      toast.success(
        `${result.pvsSynchronized} PVs e ${result.absSynchronized} ABs sincronizadas` +
          (result.pendingAb ? `; ${result.pendingAb} ABs aguardando PV histórica` : ""),
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar Pastas");
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading || (!isAdmin && !isDiretor)) return null;

  return (
    <div className="relative z-10 space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAdmin && (
          <>
            <Button
              variant="outline"
              onClick={() => setLinksOpen(true)}
              className="rounded-none border-[#39FF14]/45 bg-black/70 text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14] hover:bg-[#39FF14]/10 hover:text-[#39FF14]"
            >
              <Link2 className="mr-2 h-4 w-4" /> Vincular equipe
            </Button>
            <Button
              onClick={sync}
              disabled={syncing || loading}
              className="rounded-none bg-[#39FF14] text-[10px] font-black uppercase tracking-[0.18em] text-black hover:bg-[#39FF14]/80"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando" : "Sincronizar PV / AB"}
            </Button>
          </>
        )}
        <div ref={filtersRef} className="relative">
          <Button
            variant="outline"
            onClick={() => setFiltersOpen((open) => !open)}
            className="rounded-none border-[#39FF14]/45 bg-black/70 text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14] hover:bg-[#39FF14]/10 hover:text-[#39FF14]"
          >
            <span className="relative mr-2 block h-4 w-6" aria-hidden>
              <span
                className={`absolute top-1/2 h-[2px] w-3.5 bg-current transition-all duration-300 ${filtersOpen ? "left-1/2 -translate-x-1/2 rotate-45" : "left-[22%] -translate-x-1/2 -rotate-[65deg]"}`}
              />
              <span
                className={`absolute top-1/2 h-[2px] w-3.5 bg-current transition-all duration-300 ${filtersOpen ? "left-1/2 -translate-x-1/2 -rotate-45" : "left-[78%] -translate-x-1/2 -rotate-[65deg]"}`}
              />
            </span>
            Filtro
          </Button>
          <div
            className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,360px)] space-y-3 border border-[#39FF14]/35 bg-black/95 p-4 shadow-[0_0_40px_rgba(57,255,20,0.14)] backdrop-blur-2xl transition-all ${filtersOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}
          >
            <div className="border-b border-[#39FF14]/20 pb-2 text-[9px] uppercase tracking-[0.25em] text-white/40">
              / / FILTROS
            </div>
            <FilterSelect
              label="Diretor"
              value={directorFilter}
              onChange={(value) => {
                setDirectorFilter(value);
                setSuperFilter(ALL);
                setManagerFilter(ALL);
              }}
              options={[{ value: ALL, label: "Todos" }, ...directors.map(option)]}
            />
            <FilterSelect
              label="Superintendente"
              value={superFilter}
              onChange={(value) => {
                setSuperFilter(value);
                setManagerFilter(ALL);
              }}
              options={[{ value: ALL, label: "Todos" }, ...supers.map(option)]}
            />
            <FilterSelect
              label="Gerente"
              value={managerFilter}
              onChange={setManagerFilter}
              options={[{ value: ALL, label: "Todos" }, ...managers.map(option)]}
            />
            <FilterSelect
              label="Empreendimento"
              value={enterpriseFilter}
              onChange={setEnterpriseFilter}
              options={[{ value: ALL, label: "Todos" }, ...enterprises.map(option)]}
            />
            <FilterSelect
              label="Análise bancária"
              value={abFilter}
              onChange={setAbFilter}
              options={[
                { value: ALL, label: "Todas as PVs" },
                { value: "with", label: "Com AB" },
                { value: "without", label: "Sem AB" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <DateFilter label="Data inicial" value={dateFrom} onChange={setDateFrom} />
              <DateFilter label="Data final" value={dateTo} onChange={setDateTo} />
            </div>
            <Button
              variant="outline"
              className="w-full rounded-none border-[#39FF14]/35 bg-transparent text-[9px] uppercase tracking-[0.16em] text-[#39FF14]"
              onClick={clearFilters}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </div>

      {isAdmin && (
        <Dialog
          open={linksOpen}
          onOpenChange={(open) => {
            setLinksOpen(open);
            if (!open) void load();
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-[#39FF14]/35 bg-black/95 text-white backdrop-blur-2xl">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-[0.16em] text-[#39FF14]">
                Vincular equipe
              </DialogTitle>
              <DialogDescription>
                Os vínculos são compartilhados com Vendas e aplicados imediatamente aos dados já
                importados nas duas abas.
              </DialogDescription>
            </DialogHeader>
            <VendasHierarchyPanel token={token} />
          </DialogContent>
        </Dialog>
      )}

      <PastasOverview rows={filtered} loading={loading} abStored={abStored} />

      {pendingAb > 0 && (
        <div className="border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-amber-100/70">
          {pendingAb} ABs estão armazenadas e aguardam a carga histórica da PV correspondente. Elas
          serão vinculadas automaticamente quando essas PVs forem importadas.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <SummaryTable title="Por gerente" rows={byManager} />
        <SummaryTable title="Por empreendimento" rows={byEnterprise} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[9px] uppercase tracking-[0.16em] text-white/30">
        <span>Fonte: Salesforce / Google Sheets · Acúmulo por identificador único</span>
        <span>Última sincronização: {formatDate(lastSync)}</span>
      </div>
    </div>
  );
}

function option(value: string) {
  return { value, label: value };
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] uppercase tracking-[0.16em] text-white/45">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-none border-[#39FF14]/30 bg-black text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-none border-[#39FF14]/30 bg-black text-white">
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] uppercase tracking-[0.16em] text-white/45">{label}</Label>
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-none border-[#39FF14]/30 bg-black text-white"
      />
    </div>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: SummaryRow[] }) {
  return (
    <Card className="rounded-none border-white/10 bg-black/65">
      <CardHeader className="border-b border-white/10 pb-3">
        <CardTitle className="text-[10px] uppercase tracking-[0.2em] text-[#39FF14]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[420px] overflow-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[#070707] text-[8px] uppercase tracking-[0.16em] text-white/35">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-3 py-3 text-right font-medium">PV</th>
              <th className="px-3 py-3 text-right font-medium">Com AB</th>
              <th className="px-3 py-3 text-right font-medium">Sem AB</th>
              <th className="px-4 py-3 text-right font-medium">% AB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-white/[0.06] hover:bg-white/[0.025]">
                <td className="max-w-[260px] truncate px-4 py-3 text-white/75">{row.name}</td>
                <td className="px-3 py-3 text-right tabular-nums text-white/60">{row.total}</td>
                <td className="px-3 py-3 text-right tabular-nums text-[#39FF14]">{row.withAb}</td>
                <td className="px-3 py-3 text-right tabular-nums text-white/40">{row.withoutAb}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white/75">
                  {row.rate.toFixed(1)}%
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/30">
                  Nenhum dado encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
