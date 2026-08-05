import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, RefreshCw, Trash2, ChevronRight, Check, Plus, Pencil, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { vendasBulkImport, vendasList, vendasBatchesList, vendasBatchDelete, vendasHierarquiaList, previsaoSupsList, previsaoCreate, previsaoCreateBulk, previsaoGerentesList, previsaoDelete, previsaoUpdate, produtosPrevisaoList, produtoAliasesSugerir, produtoPrevisaoCreate, produtoPrevisaoDelete, produtoPrevisaoToggleAtivo, produtoAliasUpsert, previsaoGroupGet, previsaoGroupUpsert, produtoSolicitar } from "@/functions/vendas.functions";
import { hierarquiaAliasUpsert, hierarquiaAliasDelete } from "@/functions/leads.functions";
import { fmtDateTime } from "@/lib/format";
import { cyberBtnGhost } from "@/lib/cyber-ui";

const cyberTableCard = "rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md shadow-[0_0_30px_-15px_rgba(57,255,20,0.4)]";
const cyberTableTitle = "text-sm uppercase tracking-[0.25em] text-[#39FF14] font-bold";
const cyberTableClass = "[&_th]:text-[#39FF14] [&_th]:uppercase [&_th]:tracking-[0.2em] [&_th]:text-[10px] [&_th]:font-semibold [&_td]:text-white [&_tr]:border-[#39FF14]/20";

const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtNumDec = (n: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
const fmtPct = (realizado: number, previsao: number) => {
  if (!previsao || previsao <= 0) return "—";
  const pct = (Number(realizado || 0) / Number(previsao)) * 100;
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(pct)}%`;
};
const pctClass = (realizado: number, previsao: number) => {
  if (!previsao || previsao <= 0) return "text-muted-foreground";
  const r = Number(realizado || 0) / Number(previsao);
  return r >= 1 ? "text-emerald-600" : r >= 0.7 ? "text-amber-600" : "text-rose-600";
};
// Escada vermelho->amarelo->verde (0% a 100%), >100% verde puro.
const realizadoColor = (realizado: number, previsao: number): string | undefined => {
  if (!previsao || previsao <= 0) {
    return Number(realizado || 0) > 0 ? "hsl(140 80% 55%)" : undefined;
  }
  const r = Number(realizado || 0) / Number(previsao);
  if (r >= 1) return "hsl(140 80% 55%)";
  const pct = Math.max(0, Math.min(1, r));
  // 0% -> 0 (vermelho), 50% -> 60 (amarelo), 100% -> 140 (verde)
  const hue = pct <= 0.5 ? pct * 2 * 60 : 60 + (pct - 0.5) * 2 * 80;
  return `hsl(${hue.toFixed(0)} 85% 55%)`;
};
const saldoColor = (saldo: number): string => saldo < 0 ? "#f43f5e" : "#10b981";

// Tintas sutis por coluna (paleta do projeto)
const COL = {
  previsao: "w-36 bg-[oklch(0.43_0.18_264.18/0.05)]",   // accent (azul)
  realizado: "w-36 bg-[oklch(0.498_0.135_147.8/0.06)]", // secondary (verde)
  saldo: "w-36 bg-muted/40",
  pct: "w-32 bg-[oklch(0.582_0.222_359.84/0.05)]",      // primary (magenta)
  unidades: "w-32 bg-muted/30",
};

type SortDir = "asc" | "desc";
function useSort<K extends string>(initialKey: K, initialDir: SortDir = "desc") {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  function toggle(k: K) {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("desc"); }
  }
  return { key, dir, toggle };
}
function sortRows<T>(rows: T[], key: string, dir: SortDir): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a: any, b: any) => {
    const va = a[key]; const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
    return String(va).localeCompare(String(vb), "pt-BR") * mul;
  });
}
function SortHead({
  label, sortKey, current, dir, onClick, className = "", labelClass = "",
}: { label: string; sortKey: string; current: string; dir: SortDir; onClick: (k: string) => void; className?: string; labelClass?: string }) {
  const active = current === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${className.includes("text-right") ? "justify-end w-full" : ""} ${active ? "font-medium" : ""}`}
      >
        <span className={labelClass}>{label}</span>
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </TableHead>
  );
}

export const Route = createFileRoute("/_app/previsao")({
  head: () => ({
    meta: [
      { title: "Previsão — DIRETORIA GORRÃO" },
      { name: "description", content: "Previsão vs vendas realizadas." },
    ],
  }),
  component: PrevisaoPage,
});

type Venda = {
  id: string;
  pv: string;
  empreendimento: string | null;
  data_assinatura: string | null;
  superintendente: string | null;
  gerente: string | null;
  corretor: string | null;
  diretor: string | null;
  vgv: number;
  unidades: number;
  produto_id: string | null;
};
type Previsao = {
  id: string;
  superintendente: string | null;
  gerente: string | null;
  produto_id: string | null;
  semana_inicio: string | null;
  semana_fim: string | null;
  preciso_vendas: number;
  realizado: number;
  observacao: string | null;
};
type ProdutoLite = { id: string; nome: string; ativo: boolean };
type Batch = { id: string; created_at: string; total: number; vgv: number; unidades: number; created_by: string | null };

const ALL = "__all__";

function normalizeKey(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const HEADER_MAP: Record<string, string> = {
  pv: "pv", numero: "pv", numerovenda: "pv", numerodavenda: "pv",
  empreendimento: "empreendimento", produto: "empreendimento",
  dataassinatura: "data_assinatura", dataprimeiraassinatura: "data_assinatura", data: "data_assinatura", assinatura: "data_assinatura",
  superintendente: "superintendente", super: "superintendente",
  gerente: "gerente",
  corretor: "corretor", vendedor: "corretor",
  diretor: "diretor",
  vgv: "vgv", valor: "vgv", valorvgv: "vgv",
  unidades: "unidades", contagem: "unidades", contagemdeunidades: "unidades", contagemdefifty: "unidades", fifty: "unidades", qtd: "unidades", quantidade: "unidades", realizado: "unidades",
};

function detectColumn(h: string): string | null {
  return HEADER_MAP[normalizeKey(h)] ?? null;
}

function parseDateISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const s = String(v).trim();
  // dd/mm/aaaa ou dd-mm-aaaa (com ou sem hora depois)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // ISO yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

function parseNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function PrevisaoPage() {
  const { session, role, canEdit } = useAuth();
  const token = session?.access_token ?? "";
  const isAdmin = role === "admin";

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [loading, setLoading] = useState(false);

  const [supFilter, setSupFilter] = useState<string>(ALL);
  const [gerFilter, setGerFilter] = useState<string>(ALL);
  const [corFilter, setCorFilter] = useState<string>(ALL);
  const [dataIni, setDataIni] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [viewVendas, setViewVendas] = useState<"emp" | "ger">("emp");

  async function reload() {
    if (!token) return;
    setLoading(true);
    try {
      const { data: { session: fresh } } = await supabase.auth.getSession();
      const tk = fresh?.access_token ?? token;
      const r = (await vendasList({ data: { token: tk } })) as { vendas: Venda[]; previsoes: Previsao[]; produtos: ProdutoLite[] };
      setVendas(r.vendas);
      setPrevisoes(r.previsoes);
      setProdutos(r.produtos ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [token]);

  const sups = useMemo(() => Array.from(new Set([...vendas.map(v => v.superintendente), ...previsoes.map(p => p.superintendente)].filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR")), [vendas, previsoes]);
  const gers = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendas) {
      if (!v.gerente) continue;
      if (supFilter !== ALL && v.superintendente !== supFilter) continue;
      set.add(v.gerente);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [vendas, supFilter]);
  const corretores = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendas) {
      if (!v.corretor) continue;
      if (supFilter !== ALL && v.superintendente !== supFilter) continue;
      if (gerFilter !== ALL && v.gerente !== gerFilter) continue;
      set.add(v.corretor);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [vendas, supFilter, gerFilter]);

  // ===== Filtros aplicados =====
  const vendasF = useMemo(() => vendas.filter((v) => {
    if (supFilter !== ALL && v.superintendente !== supFilter) return false;
    if (gerFilter !== ALL && v.gerente !== gerFilter) return false;
    if (corFilter !== ALL && v.corretor !== corFilter) return false;
    if (dataIni && (!v.data_assinatura || v.data_assinatura < dataIni)) return false;
    if (dataFim && (!v.data_assinatura || v.data_assinatura > dataFim)) return false;
    return true;
  }), [vendas, supFilter, gerFilter, corFilter, dataIni, dataFim]);

  const previsoesF = useMemo(() => previsoes.filter((p) => {
    if (supFilter !== ALL && p.superintendente !== supFilter) return false;
    if (dataIni && p.semana_inicio && p.semana_inicio < dataIni) return false;
    if (dataFim && p.semana_inicio && p.semana_inicio > dataFim) return false;
    return true;
  }), [previsoes, supFilter, dataIni, dataFim]);

  const totalPrevisao = useMemo(() => previsoesF.reduce((a, p) => a + Number(p.preciso_vendas || 0), 0), [previsoesF]);
  const totalRealizado = useMemo(() => vendasF.reduce((a, v) => a + Number(v.unidades || 0), 0), [vendasF]);
  const saldo = totalRealizado - totalPrevisao;

  // ===== Tabela: Superintendente -> Gerente =====
  const tabelaSup = useMemo(() => {
    const map = new Map<string, { previsao: number; realizado: number; gerentes: Map<string, { previsao: number; realizado: number }> }>();
    for (const p of previsoesF) {
      const k = p.superintendente || "—";
      if (!map.has(k)) map.set(k, { previsao: 0, realizado: 0, gerentes: new Map() });
      const s = map.get(k)!;
      s.previsao += Number(p.preciso_vendas || 0);
      if (p.gerente) {
        const gk = p.gerente;
        if (!s.gerentes.has(gk)) s.gerentes.set(gk, { previsao: 0, realizado: 0 });
        s.gerentes.get(gk)!.previsao += Number(p.preciso_vendas || 0);
      }
    }
    for (const v of vendasF) {
      const k = v.superintendente || "—";
      if (!map.has(k)) map.set(k, { previsao: 0, realizado: 0, gerentes: new Map() });
      const s = map.get(k)!;
      s.realizado += Number(v.unidades || 0);
      const gk = v.gerente || "—";
      if (!s.gerentes.has(gk)) s.gerentes.set(gk, { previsao: 0, realizado: 0 });
      s.gerentes.get(gk)!.realizado += Number(v.unidades || 0);
    }
    return Array.from(map.entries())
      .map(([nome, x]) => ({
        nome,
        previsao: x.previsao,
        realizado: x.realizado,
        saldo: x.realizado - x.previsao,
        pct: x.previsao > 0 ? x.realizado / x.previsao : 0,
        gerentes: Array.from(x.gerentes.entries()).map(([gn, gx]) => ({
          nome: gn,
          previsao: gx.previsao,
          realizado: gx.realizado,
          saldo: gx.realizado - gx.previsao,
          pct: gx.previsao > 0 ? gx.realizado / gx.previsao : 0,
        })),
      }));
  }, [previsoesF, vendasF]);

  // ===== Tabela: Empreendimento =====
  const tabelaEmp = useMemo(() => {
    // Agregar previsões por produto_id
    const previsaoByProd = new Map<string, number>();
    for (const p of previsoesF) {
      const pid = p.produto_id ?? "__sem_produto__";
      previsaoByProd.set(pid, (previsaoByProd.get(pid) || 0) + Number(p.preciso_vendas || 0));
    }

    const map = new Map<string, { previsao: number; realizado: number; unidades: number; produto_id: string | null }>();
    for (const v of vendasF) {
      const k = v.empreendimento || "—";
      if (!map.has(k)) map.set(k, { previsao: 0, realizado: 0, unidades: 0, produto_id: v.produto_id ?? null });
      const s = map.get(k)!;
      s.realizado += Number(v.unidades || 0);
      s.unidades += Number(v.unidades || 0);
      if (!s.produto_id && v.produto_id) s.produto_id = v.produto_id;
    }

    // Atribuir previsão do produto a cada empreendimento vinculado
    for (const [, x] of map.entries()) {
      if (x.produto_id) {
        x.previsao = previsaoByProd.get(x.produto_id) || 0;
      }
    }

    return Array.from(map.entries())
      .map(([nome, x]) => ({ nome, produto_id: x.produto_id, previsao: x.previsao, realizado: x.realizado, saldo: x.realizado - x.previsao, unidades: x.unidades, pct: x.previsao > 0 ? x.realizado / x.previsao : 0 }));
  }, [vendasF, previsoesF]);

  // ===== Tabela: Gerente =====
  const tabelaGer = useMemo(() => {
    const map = new Map<string, { previsao: number; realizado: number; superintendente: string | null }>();
    for (const p of previsoesF) {
      if (!p.gerente) continue;
      const k = p.gerente;
      if (!map.has(k)) map.set(k, { previsao: 0, realizado: 0, superintendente: p.superintendente });
      map.get(k)!.previsao += Number(p.preciso_vendas || 0);
    }
    for (const v of vendasF) {
      const k = v.gerente || "—";
      if (!map.has(k)) map.set(k, { previsao: 0, realizado: 0, superintendente: v.superintendente });
      map.get(k)!.realizado += Number(v.unidades || 0);
    }
    return Array.from(map.entries())
      .map(([nome, x]) => ({ nome, sup: x.superintendente, previsao: x.previsao, realizado: x.realizado, saldo: x.realizado - x.previsao, pct: x.previsao > 0 ? x.realizado / x.previsao : 0 }));
  }, [vendasF]);

  const supSort = useSort<"nome" | "previsao" | "realizado" | "saldo" | "pct">("realizado");
  const empSort = useSort<"nome" | "unidades" | "previsao" | "realizado" | "saldo" | "pct">("realizado");
  const gerSort = useSort<"nome" | "sup" | "previsao" | "realizado" | "saldo" | "pct">("realizado");

  const tabelaSupSorted = useMemo(() => sortRows(tabelaSup, supSort.key, supSort.dir).map((s) => ({ ...s, gerentes: sortRows(s.gerentes, supSort.key === "nome" ? "nome" : supSort.key, supSort.dir) })), [tabelaSup, supSort.key, supSort.dir]);
  const tabelaEmpSorted = useMemo(() => sortRows(tabelaEmp, empSort.key, empSort.dir), [tabelaEmp, empSort.key, empSort.dir]);
  const tabelaGerSorted = useMemo(() => sortRows(tabelaGer, gerSort.key, gerSort.dir), [tabelaGer, gerSort.key, gerSort.dir]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {canEdit && <NovaPrevisaoDialog token={token} onDone={reload} />}
        <Button size="sm" className={cyberBtnGhost} onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="resumo" className="space-y-4">
        <TabsList className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md p-1 h-auto">
          <TabsTrigger value="resumo" className="rounded-none uppercase tracking-[0.25em] text-[10px] data-[state=active]:bg-[#39FF14] data-[state=active]:text-black text-gray-400">Resumo</TabsTrigger>
          {isAdmin && <TabsTrigger value="importar" className="rounded-none uppercase tracking-[0.25em] text-[10px] data-[state=active]:bg-[#39FF14] data-[state=active]:text-black text-gray-400">Importar</TabsTrigger>}
          {isAdmin && <TabsTrigger value="bases" className="rounded-none uppercase tracking-[0.25em] text-[10px] data-[state=active]:bg-[#39FF14] data-[state=active]:text-black text-gray-400">Bases importadas</TabsTrigger>}
          {isAdmin && <TabsTrigger value="vinculo" className="rounded-none uppercase tracking-[0.25em] text-[10px] data-[state=active]:bg-[#39FF14] data-[state=active]:text-black text-gray-400">Vínculo</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumo" className="space-y-6">
          {/* Filtros */}
          <Card className="rounded-none border-0 bg-transparent shadow-none backdrop-blur-0">
            <CardHeader><CardTitle className={cyberTableTitle}>// FILTROS</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Superintendente</Label>
                <Select value={supFilter} onValueChange={(v) => { setSupFilter(v); setGerFilter(ALL); setCorFilter(ALL); }}>
                  <SelectTrigger className="rounded-none border-[#39FF14]/30 bg-black/55 text-white/95 backdrop-blur-sm focus:border-[#39FF14] focus:ring-0 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none bg-black/92 border-[#39FF14]/30 text-white">
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {sups.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gerente</Label>
                <Select value={gerFilter} onValueChange={(v) => { setGerFilter(v); setCorFilter(ALL); }}>
                  <SelectTrigger className="rounded-none border-[#39FF14]/30 bg-black/55 text-white/95 backdrop-blur-sm focus:border-[#39FF14] focus:ring-0 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none bg-black/92 border-[#39FF14]/30 text-white">
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {gers.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Corretor</Label>
                <Select value={corFilter} onValueChange={setCorFilter}>
                  <SelectTrigger className="rounded-none border-[#39FF14]/30 bg-black/55 text-white/95 backdrop-blur-sm focus:border-[#39FF14] focus:ring-0 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none bg-black/92 border-[#39FF14]/30 text-white">
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {corretores.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data início (assinatura)</Label>
                <Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} className="rounded-none border-[#39FF14]/30 bg-black/55 text-white/95 backdrop-blur-sm focus:border-[#39FF14] focus:ring-0 h-9 [color-scheme:dark]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data fim (assinatura)</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="rounded-none border-[#39FF14]/30 bg-black/55 text-white/95 backdrop-blur-sm focus:border-[#39FF14] focus:ring-0 h-9 [color-scheme:dark]" />
              </div>
              <div className="lg:col-span-5">
                <Button variant="ghost" size="sm" onClick={() => { setSupFilter(ALL); setGerFilter(ALL); setCorFilter(ALL); setDataIni(""); setDataFim(""); }}>Limpar filtros</Button>
              </div>
            </CardContent>
          </Card>

          {/* Resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Previsão", value: fmtNum(totalPrevisao) },
              { label: "Vendas feitas", value: fmtNumDec(totalRealizado) },
              { label: "Saldo", value: fmtNumDec(saldo), color: saldoColor(saldo) },
              { label: "% Realizado", value: fmtPct(totalRealizado, totalPrevisao), color: realizadoColor(totalRealizado, totalPrevisao) },
            ].map((c) => (
              <Card key={c.label} className={cyberTableCard}>
                <CardHeader className="pb-2">
                  <CardTitle className={cyberTableTitle}>// {c.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`font-mono text-2xl ${c.color ? "" : "text-white"}`} style={c.color ? { color: c.color } : undefined}>{c.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

      {/* Tabela superintendentes -> gerentes */}
      <Card className={cyberTableCard}>
        <CardHeader><CardTitle className={cyberTableTitle}>// SUPERINTENDENTES & GERENTES</CardTitle></CardHeader>
        <CardContent>
          {tabelaSup.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <Table className={cyberTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <SortHead label="Nome" sortKey="nome" current={supSort.key} dir={supSort.dir} onClick={(k) => supSort.toggle(k as any)} />
                  <SortHead label="Previsão" sortKey="previsao" current={supSort.key} dir={supSort.dir} onClick={(k) => supSort.toggle(k as any)} className={`text-right ${COL.previsao}`} />
                  <SortHead label="Realizado" sortKey="realizado" current={supSort.key} dir={supSort.dir} onClick={(k) => supSort.toggle(k as any)} className={`text-right ${COL.realizado}`} />
                  <SortHead label="Saldo" sortKey="saldo" current={supSort.key} dir={supSort.dir} onClick={(k) => supSort.toggle(k as any)} className={`text-right ${COL.saldo}`} />
                  <SortHead label="% Realizado" sortKey="pct" current={supSort.key} dir={supSort.dir} onClick={(k) => supSort.toggle(k as any)} className={`text-right whitespace-nowrap ${COL.pct}`} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabelaSupSorted.map((s) => (
                  <SupRow key={s.nome} sup={s} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tabela vendas (toggle) */}
      <Card className={cyberTableCard}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className={cyberTableTitle}>
              {viewVendas === "emp" ? "// VENDAS POR PRODUTO E EMPREENDIMENTO" : "// VENDAS POR GERENTE"}
            </CardTitle>
            <div className="inline-flex rounded-md border bg-muted/30 p-1">
              <Button
                size="sm"
                variant={viewVendas === "emp" ? "default" : "ghost"}
                className="h-8"
                onClick={() => setViewVendas("emp")}
              >
                Ver por empreendimento
              </Button>
              <Button
                size="sm"
                variant={viewVendas === "ger" ? "default" : "ghost"}
                className="h-8"
                onClick={() => setViewVendas("ger")}
              >
                Ver por gerente
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewVendas === "emp" ? (
            tabelaEmp.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ProdutoEmpreendimentoTable rows={tabelaEmpSorted} produtos={produtos} />
            )
          ) : tabelaGer.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <Table className={cyberTableClass}>
              <TableHeader>
                <TableRow>
                  <SortHead label="Gerente" sortKey="nome" current={gerSort.key} dir={gerSort.dir} onClick={(k) => gerSort.toggle(k as any)} />
                  <SortHead label="Superintendente" sortKey="sup" current={gerSort.key} dir={gerSort.dir} onClick={(k) => gerSort.toggle(k as any)} />
                  <SortHead label="Previsão" sortKey="previsao" current={gerSort.key} dir={gerSort.dir} onClick={(k) => gerSort.toggle(k as any)} className={`text-right ${COL.previsao}`} />
                  <SortHead label="Realizado" sortKey="realizado" current={gerSort.key} dir={gerSort.dir} onClick={(k) => gerSort.toggle(k as any)} className={`text-right ${COL.realizado}`} />
                  <SortHead label="Saldo" sortKey="saldo" current={gerSort.key} dir={gerSort.dir} onClick={(k) => gerSort.toggle(k as any)} className={`text-right ${COL.saldo}`} />
                  <SortHead label="% Realizado" sortKey="pct" current={gerSort.key} dir={gerSort.dir} onClick={(k) => gerSort.toggle(k as any)} className={`text-right whitespace-nowrap ${COL.pct}`} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabelaGerSorted.map((g) => (
                  <TableRow key={g.nome}>
                    <TableCell className="font-medium">{g.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{g.sup ?? "—"}</TableCell>
                    <TableCell className={`text-right font-mono ${COL.previsao}`}>{fmtNum(g.previsao)}</TableCell>
                    <TableCell className={`text-right font-mono ${COL.realizado}`}>{fmtNumDec(g.realizado)}</TableCell>
                    <TableCell className={`text-right font-mono ${COL.saldo}`} style={{ color: saldoColor(g.saldo) }}>{fmtNumDec(g.saldo)}</TableCell>
                    <TableCell className={`text-right font-mono ${COL.pct}`} style={{ color: realizadoColor(g.realizado, g.previsao) }}>{fmtPct(g.realizado, g.previsao)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Previsões lançadas */}
      <PrevisoesLancadasCard
        token={token}
        isAdmin={canEdit}
        previsoes={previsoesF}
        onChange={reload}
      />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="importar">
            <ImportarTab token={token} onDone={reload} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="bases">
            <BatchesTab token={token} onDone={reload} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="vinculo">
            <VinculoTab token={token} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function SupRow({ sup }: { sup: { nome: string; previsao: number; realizado: number; saldo: number; gerentes: { nome: string; previsao: number; realizado: number; saldo: number }[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        className={`cursor-pointer border-l-2 border-l-primary/70 ${open ? "bg-primary/[0.04]" : "hover:bg-primary/[0.03]"}`}
        onClick={() => setOpen((o) => !o)}
      >
        <TableCell className="w-8">
          <ChevronRight className={`h-4 w-4 text-primary transition-transform ${open ? "rotate-90" : ""}`} />
        </TableCell>
        <TableCell className="font-semibold">{sup.nome}</TableCell>
        <TableCell className={`text-right font-mono ${COL.previsao}`}>{fmtNum(sup.previsao)}</TableCell>
        <TableCell className={`text-right font-mono ${COL.realizado}`}>{fmtNumDec(sup.realizado)}</TableCell>
        <TableCell className={`text-right font-mono ${COL.saldo}`} style={{ color: saldoColor(sup.saldo) }}>{fmtNumDec(sup.saldo)}</TableCell>
        <TableCell className={`text-right font-mono ${COL.pct}`} style={{ color: realizadoColor(sup.realizado, sup.previsao) }}>{fmtPct(sup.realizado, sup.previsao)}</TableCell>
      </TableRow>
      {open && sup.gerentes.map((g, i) => (
        <TableRow
          key={g.nome}
          className={`border-l-2 border-l-accent/50 bg-accent/[0.03] ${i === sup.gerentes.length - 1 ? "border-b-2 border-b-primary/20" : ""}`}
        >
          <TableCell></TableCell>
          <TableCell className="pl-8 text-sm text-muted-foreground">
            <span className="text-accent/70 mr-1">↳</span>{g.nome}
          </TableCell>
          <TableCell className={`text-right font-mono text-sm ${COL.previsao}`}>{fmtNum(g.previsao)}</TableCell>
          <TableCell className={`text-right font-mono text-sm ${COL.realizado}`}>{fmtNumDec(g.realizado)}</TableCell>
          <TableCell className={`text-right font-mono text-sm ${COL.saldo}`} style={{ color: saldoColor(g.saldo) }}>{fmtNumDec(g.saldo)}</TableCell>
          <TableCell className={`text-right font-mono text-sm ${COL.pct}`} style={{ color: realizadoColor(g.realizado, g.previsao) }}>{fmtPct(g.realizado, g.previsao)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "__none__", label: "— ignorar —" },
  { value: "pv", label: "PV (nº da venda) *" },
  { value: "empreendimento", label: "Empreendimento" },
  { value: "data_assinatura", label: "Data de assinatura" },
  { value: "superintendente", label: "Superintendente" },
  { value: "gerente", label: "Gerente" },
  { value: "corretor", label: "Corretor" },
  { value: "diretor", label: "Diretor" },
  { value: "vgv", label: "VGV" },
  { value: "unidades", label: "Unidades (realizado)" },
];

function ImportarTab({ token, onDone }: { token: string; onDone: () => void }) {
  type ProdMapItem = { nome: string; norm: string; produto_id: string | null; suggested_produto_id: string | null };
  type ProdLite = { id: string; nome: string; ativo: boolean };
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, any>[] | null>(null);
  const [importing, setImporting] = useState(false);
  // ---- Etapa de mapeamento de produto por empreendimento ----
  const [showProdMap, setShowProdMap] = useState(false);
  const [prodMap, setProdMap] = useState<ProdMapItem[]>([]);
  const [produtosCadastro, setProdutosCadastro] = useState<ProdLite[]>([]);
  const [prodChoice, setProdChoice] = useState<Record<string, string>>({}); // norm -> "skip" | "<uuid>" | "new:<nome>"
  const [novoProdNomeByNorm, setNovoProdNomeByNorm] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
        if (!rows.length) { toast.error("Planilha vazia"); return; }
        const hs = Object.keys(rows[0]);
        const auto: Record<string, string> = {};
        for (const h of hs) {
          const c = detectColumn(h);
          if (c) auto[h] = c;
        }
        setHeaders(hs);
        setMapping(auto);
        setPreview(rows);
      } catch (err: any) {
        toast.error("Erro ao ler arquivo: " + (err?.message ?? ""));
      }
    };
    reader.readAsBinaryString(f);
  }

  function reset() {
    setPreview(null); setHeaders([]); setMapping({}); setFileName("");
    setShowProdMap(false); setProdMap([]); setProdChoice({}); setNovoProdNomeByNorm({});
    if (fileRef.current) fileRef.current.value = "";
  }

  async function startMappingOrImport() {
    if (!preview) return;
    const pvHeader = Object.entries(mapping).find(([, c]) => c === "pv")?.[0];
    if (!pvHeader) { toast.error("Selecione a coluna do PV (nº da venda)"); return; }
    const empHeader = Object.entries(mapping).find(([, c]) => c === "empreendimento")?.[0];
    if (!empHeader) {
      // Sem empreendimento, pula direto pra importação
      await doImport(new Map());
      return;
    }
    // Coletar empreendimentos distintos
    const set = new Set<string>();
    for (const r of preview) {
      const v = r[empHeader];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) set.add(s);
    }
    if (set.size === 0) { await doImport(new Map()); return; }
    try {
      const r = (await produtoAliasesSugerir({ data: { token, nomes: Array.from(set) } })) as {
        items: ProdMapItem[]; produtos: ProdLite[];
      };
      setProdMap(r.items);
      setProdutosCadastro(r.produtos);
      // Pré-selecionar matches/sugestões
      const choice: Record<string, string> = {};
      for (const it of r.items) {
        if (it.produto_id) choice[it.norm] = it.produto_id;
        else if (it.suggested_produto_id) choice[it.norm] = it.suggested_produto_id;
        else choice[it.norm] = "skip";
      }
      setProdChoice(choice);
      setShowProdMap(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao mapear produtos");
    }
  }

  async function confirmMappingAndImport() {
    setSavingMap(true);
    try {
      const empToProd = new Map<string, string>(); // empreendimento original -> produto_id
      // Para cada item, resolver escolha
      for (const it of prodMap) {
        const c = prodChoice[it.norm] ?? "skip";
        if (c === "skip") continue;
        let prodId: string | null = null;
        if (c.startsWith("new:")) {
          const nomeNovo = (novoProdNomeByNorm[it.norm] ?? it.nome).trim();
          if (!nomeNovo) continue;
          const r = (await produtoPrevisaoCreate({ data: { token, nome: nomeNovo } })) as { id: string };
          prodId = r.id;
          await produtoAliasUpsert({ data: { token, produto_id: prodId, alias: it.nome } });
        } else {
          prodId = c;
          // Vincula alias só se ainda não vinculado a esse produto
          if (!it.produto_id || it.produto_id !== prodId) {
            await produtoAliasUpsert({ data: { token, produto_id: prodId, alias: it.nome } });
          }
        }
        if (prodId) empToProd.set(it.nome, prodId);
      }
      setShowProdMap(false);
      await doImport(empToProd);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar mapeamento");
    } finally {
      setSavingMap(false);
    }
  }

  async function doImport(empToProd: Map<string, string>) {
    if (!preview) return;
    const pvHeader = Object.entries(mapping).find(([, c]) => c === "pv")?.[0];
    if (!pvHeader) { toast.error("Selecione a coluna do PV (nº da venda)"); return; }
    setImporting(true);
    try {
      const payload = preview.map((r) => {
        const o: any = {};
        for (const [h, c] of Object.entries(mapping)) {
          if (!c || c === "__none__") continue;
          const v = r[h];
          if (v == null) continue;
          if (c === "data_assinatura") o[c] = parseDateISO(v);
          else if (c === "vgv") o[c] = parseNumber(v);
          else if (c === "unidades") o[c] = Math.max(0, parseNumber(v));
          else o[c] = String(v).trim() || null;
        }
        if (o.empreendimento && empToProd.has(o.empreendimento)) {
          o.produto_id = empToProd.get(o.empreendimento);
        }
        return o;
      }).filter((r) => r.pv);

      if (!payload.length) { toast.error("Nenhuma linha com PV válido"); return; }

      const CHUNK = 300;
      let total = 0;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const r = (await vendasBulkImport({ data: { token, rows: slice } })) as { total: number };
        total += r.total;
        toast.message(`Importando... ${Math.min(i + CHUNK, payload.length)}/${payload.length}`);
      }
      toast.success(`Importadas ${total} vendas`);
      reset();
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-secondary">Importar base de vendas</CardTitle>
        <p className="text-xs text-muted-foreground">
          Colunas reconhecidas: <b>PV</b>, Empreendimento, Data assinatura, Superintendente, Gerente, Corretor, Diretor, VGV, Unidades.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="max-w-md" />
          {preview && (
            <>
              <Button onClick={() => { void startMappingOrImport(); }} disabled={importing || savingMap}>
                <Upload className="h-4 w-4 mr-2" />
                {importing ? "Importando..." : `Importar ${preview.length} linhas`}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={importing || savingMap}>Limpar</Button>
            </>
          )}
        </div>

        {/* Dialog: mapeamento de produto por empreendimento */}
        <Dialog open={showProdMap} onOpenChange={(o) => { if (!savingMap) setShowProdMap(o); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Vincular empreendimentos a produtos</DialogTitle>
              <DialogDescription>
                Para cada empreendimento da planilha, escolha o produto correspondente.
                Se não houver produto cadastrado, crie um novo. Empreendimentos sem produto serão importados sem vínculo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {prodMap.map((it) => {
                const choice = prodChoice[it.norm] ?? "skip";
                const isNew = choice.startsWith("new:");
                return (
                  <div key={it.norm} className="rounded border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm truncate">{it.nome}</div>
                      {it.produto_id && <Badge variant="outline" className="text-[10px]">já vinculado</Badge>}
                      {!it.produto_id && it.suggested_produto_id && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300">sugerido</Badge>}
                    </div>
                    <Select
                      value={choice}
                      onValueChange={(v) => setProdChoice((m) => ({ ...m, [it.norm]: v }))}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">— Sem produto —</SelectItem>
                        <SelectItem value={`new:${it.norm}`}>+ Criar novo produto</SelectItem>
                        {produtosCadastro.filter((p) => p.ativo).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isNew && (
                      <Input
                        className="h-8"
                        placeholder="Nome do novo produto"
                        value={novoProdNomeByNorm[it.norm] ?? it.nome}
                        onChange={(e) => setNovoProdNomeByNorm((m) => ({ ...m, [it.norm]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowProdMap(false)} disabled={savingMap}>Cancelar</Button>
              <Button onClick={() => { void confirmMappingAndImport(); }} disabled={savingMap || importing}>
                {savingMap ? "Salvando..." : "Confirmar e importar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {preview && headers.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Mapeamento de colunas {fileName && <span className="text-muted-foreground font-normal">— {fileName}</span>}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {headers.map((h) => (
                <div key={h} className="space-y-1">
                  <Label className="text-xs">{h}</Label>
                  <Select
                    value={mapping[h] ?? "__none__"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="text-sm font-medium pt-3">Prévia (10 primeiras linhas)</div>
            <div className="overflow-auto border rounded-md max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 10).map((r, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h} className="text-xs">{r[h] == null ? "" : String(r[h])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Nova Previsão ============
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateBR(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function weeksOfMonth(year: number, month1: number): { ini: string; fim: string }[] {
  const first = new Date(year, month1 - 1, 1);
  const last = new Date(year, month1, 0);
  const start = new Date(first);
  // shift to Monday (Sun=0 -> 6, Mon=1 -> 0, etc.)
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const weeks: { ini: string; fim: string }[] = [];
  while (start <= last) {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    weeks.push({ ini: toISO(start), fim: toISO(end) });
    start.setDate(start.getDate() + 7);
  }
  return weeks;
}

function NovaPrevisaoDialog({ token, onDone }: { token: string; onDone: () => void }) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [sups, setSups] = useState<{ id: string; nome: string }[]>([]);
  const [supId, setSupId] = useState<string>("");
  const [gerentes, setGerentes] = useState<{ id: string; nome: string }[]>([]);
  const [quantPorGer, setQuantPorGer] = useState<Record<string, string>>({});
  const [totalSup, setTotalSup] = useState<string>("");
  const [loadingGer, setLoadingGer] = useState(false);
  const [ano, setAno] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [semanaIdx, setSemanaIdx] = useState<string>("0");
  const [observacao, setObservacao] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const semanas = useMemo(() => weeksOfMonth(ano, mes), [ano, mes]);
  const anos = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, [now]);

  useEffect(() => {
    if (!open || !token) return;
    (async () => {
      try {
        const r = (await previsaoSupsList({ data: { token, mes_referencia: mes, ano_referencia: ano } })) as { id: string; nome: string }[];
        setSups(r);
        if (supId && !r.some((s) => s.id === supId)) setSupId("");
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao carregar superintendentes");
      }
    })();
  }, [open, token, mes, ano, supId]);

  useEffect(() => {
    if (!supId || !token) { setGerentes([]); setQuantPorGer({}); return; }
    (async () => {
      setLoadingGer(true);
      try {
        const r = (await previsaoGerentesList({ data: { token, superintendente_id: supId, mes_referencia: mes, ano_referencia: ano } })) as { id: string; nome: string }[];
        setGerentes(r);
        setQuantPorGer({});
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao carregar gerentes");
      } finally {
        setLoadingGer(false);
      }
    })();
  }, [supId, token, mes, ano]);

  const supNome = sups.find((s) => s.id === supId)?.nome ?? "";

  const totalUnidades = useMemo(() => {
    let t = 0;
    for (const v of Object.values(quantPorGer)) t += parseNumber(v);
    return t;
  }, [quantPorGer]);
  const gerentesPreenchidos = useMemo(() => {
    let n = 0;
    for (const v of Object.values(quantPorGer)) if (parseNumber(v) > 0) n += 1;
    return n;
  }, [quantPorGer]);

  async function salvar() {
    const idx = parseInt(semanaIdx, 10);
    const w = semanas[idx];
    if (!supNome) { toast.error("Selecione o superintendente"); return; }
    if (!w) { toast.error("Selecione a semana"); return; }
    const itens = gerentes
      .map((g) => ({ gerente: g.nome, preciso_vendas: parseNumber(quantPorGer[g.id] ?? "") }))
      .filter((it) => it.preciso_vendas > 0);
    const totalSupNum = parseNumber(totalSup);
    if (!itens.length && totalSupNum <= 0) {
      toast.error("Informe um total para a superintendência ou ao menos um gerente");
      return;
    }
    setSaving(true);
    try {
      const base = {
        token,
        superintendente: supNome,
        mes_referencia: mes,
        ano_referencia: ano,
        semana_inicio: w.ini,
        semana_fim: w.fim,
        observacao: observacao.trim() || null,
      };
      let msg = "";
      if (totalSupNum > 0) {
        await previsaoCreate({ data: { ...base, preciso_vendas: totalSupNum } });
        msg += `Total da superintendência: ${fmtNum(totalSupNum)} un. `;
      }
      if (itens.length) {
        await previsaoCreateBulk({ data: { ...base, itens } });
        msg += `${itens.length} previsões por gerente (${fmtNum(itens.reduce((a, b) => a + b.preciso_vendas, 0))} un.)`;
      }
      toast.success(msg.trim() || "Previsão salva");
      setOpen(false);
      setQuantPorGer({}); setTotalSup(""); setObservacao(""); setSupId("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" /> Nova previsão
      </Button>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar previsão (em massa)</DialogTitle>
          <DialogDescription>Lance a previsão de vendas por gerente para uma semana do mês.</DialogDescription>
        </DialogHeader>
        {/* Resumo no topo */}
        <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-3">
          <Badge variant="outline" className="text-xs px-2 py-1">
            Superintendente: <span className="ml-1 font-medium">{supNome || "—"}</span>
          </Badge>
          <Badge variant="outline" className="text-xs px-2 py-1">
            Semana: <span className="ml-1 font-medium">{semanas[parseInt(semanaIdx, 10)] ? `${fmtDateBR(semanas[parseInt(semanaIdx, 10)].ini)} a ${fmtDateBR(semanas[parseInt(semanaIdx, 10)].fim)}` : "—"}</span>
          </Badge>
          <Badge variant="outline" className="text-xs px-2 py-1 border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300">
            Gerentes preenchidos: <span className="ml-1 font-mono">{gerentesPreenchidos}/{gerentes.length}</span>
          </Badge>
          <Badge variant="outline" className="text-xs px-2 py-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            Total previsto: <span className="ml-1 font-mono">{fmtNum(totalUnidades)}</span>
          </Badge>
        </div>
        {(() => {
          const tSup = parseNumber(totalSup);
          if (tSup <= 0 || gerentesPreenchidos === 0) return null;
          const diff = tSup - totalUnidades;
          if (diff === 0) return null;
          return (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              ⚠ O total da superintendência ({fmtNum(tSup)}) não bate com a soma dos gerentes ({fmtNum(totalUnidades)}).
              {" "}Diferença: <span className="font-mono">{diff > 0 ? "+" : ""}{fmtNum(diff)}</span>.
            </div>
          );
        })()}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Superintendente</Label>
            <Select value={supId} onValueChange={setSupId}>
              <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
              <SelectContent>
                {sups.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => { setMes(parseInt(v, 10)); setSemanaIdx("0"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((nome, i) => <SelectItem key={i} value={String(i + 1)}>{nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ano</Label>
              <Select value={String(ano)} onValueChange={(v) => { setAno(parseInt(v, 10)); setSemanaIdx("0"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Semana (segunda a domingo)</Label>
            <Select value={semanaIdx} onValueChange={setSemanaIdx}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {semanas.map((w, i) => (
                  <SelectItem key={i} value={String(i)}>
                    Semana {i + 1} — {fmtDateBR(w.ini)} a {fmtDateBR(w.fim)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Total da superintendência (opcional)</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              className="w-40 h-9"
              value={totalSup}
              onChange={(e) => setTotalSup(e.target.value)}
              placeholder="0"
            />
            <p className="text-[11px] text-muted-foreground">
              Use este campo para lançar a previsão total da superintendência sem detalhar por gerente. Pode ser combinado ou usado isoladamente.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Quantidade prevista por gerente (opcional)</Label>
            {!supId ? (
              <p className="text-xs text-muted-foreground">Selecione um superintendente para listar seus gerentes.</p>
            ) : loadingGer ? (
              <p className="text-xs text-muted-foreground">Carregando gerentes...</p>
            ) : gerentes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum gerente ativo cadastrado para este superintendente.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {gerentes.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 text-sm truncate">{g.nome}</div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="w-24 h-8"
                      value={quantPorGer[g.id] ?? ""}
                      onChange={(e) => setQuantPorGer((m) => ({ ...m, [g.id]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observação (opcional)</Label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || (gerentesPreenchidos === 0 && parseNumber(totalSup) <= 0)}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
        <div className="border-t pt-3 mt-2">
          <SolicitarProdutoInline token={token} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SolicitarProdutoInline({ token }: { token: string }) {
  const [nome, setNome] = useState("");
  const [just, setJust] = useState("");
  const [sending, setSending] = useState(false);
  async function enviar() {
    if (!nome.trim()) { toast.error("Informe o nome do produto"); return; }
    setSending(true);
    try {
      const r = (await produtoSolicitar({ data: { token, nome: nome.trim(), justificativa: just.trim() || null } })) as any;
      if (r.already_exists) toast.success("Esse produto já existe e está disponível.");
      else if (r.already_requested) toast.message("Solicitação já enviada — aguardando aprovação do admin.");
      else toast.success("Solicitação enviada para o admin aprovar.");
      setNome(""); setJust("");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar solicitação");
    } finally { setSending(false); }
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">+ Solicitar adição de novo produto (validação do admin)</summary>
      <div className="mt-2 space-y-2">
        <Input className="h-8" placeholder="Nome do produto" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
        <Input className="h-8" placeholder="Justificativa (opcional)" value={just} onChange={(e) => setJust(e.target.value)} maxLength={500} />
        <Button size="sm" onClick={enviar} disabled={sending}>{sending ? "Enviando..." : "Enviar solicitação"}</Button>
      </div>
    </details>
  );
}

// ============ BATCHES (Bases importadas) ============
function BatchesTab({ token, onDone }: { token: string; onDone: () => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    if (!token) return;
    setLoading(true);
    try {
      const r = (await vendasBatchesList({ data: { token } })) as Batch[];
      setBatches(r);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [token]);

  async function excluir(id: string) {
    try {
      const r = (await vendasBatchDelete({ data: { token, batch_id: id } })) as { deleted: number };
      toast.success(`Lote excluído (${r.deleted} vendas removidas)`);
      await reload();
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base text-secondary">Bases importadas</CardTitle>
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Recarregar
        </Button>
      </CardHeader>
      <CardContent>
        {!batches.length ? (
          <div className="text-sm text-muted-foreground">Nenhuma base importada.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs">{b.created_at ? fmtDateTime(b.created_at) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{b.id === "__sem_lote__" ? "(sem lote)" : b.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtNum(b.total)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtNumDec(b.unidades)}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir lote</AlertDialogTitle>
                          <AlertDialogDescription>Remove todas as vendas deste lote. Não pode ser desfeito.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluir(b.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============ VÍNCULO (Hierarquia) ============
type SupAliasRow = { alias: string; alias_normalizado: string; profile_id: string | null; suggested_profile_id: string | null };
type GerAliasRow = { alias: string; alias_normalizado: string; gerente_id: string | null; suggested_gerente_id: string | null };
type ProfileRef = { id: string; nome: string };
type GerenteRef = { id: string; nome: string; superintendente_id: string };

function VinculoTab({ token }: { token: string }) {
  const [sups, setSups] = useState<SupAliasRow[]>([]);
  const [gerentes, setGerentes] = useState<GerAliasRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRef[]>([]);
  const [gerCadastro, setGerCadastro] = useState<GerenteRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [novoProd, setNovoProd] = useState("");
  const [prodBusy, setProdBusy] = useState<string | null>(null);
  const [empsSemProd, setEmpsSemProd] = useState<{ nome: string; norm: string; suggested_produto_id: string | null; count: number }[]>([]);
  const [empSel, setEmpSel] = useState<Record<string, string>>({}); // norm -> produto_id | "__novo__"
  const [empNovoNome, setEmpNovoNome] = useState<Record<string, string>>({});
  const [empBusy, setEmpBusy] = useState<string | null>(null);

  async function reload() {
    if (!token) return;
    setLoading(true);
    try {
      const r = (await vendasHierarquiaList({ data: { token } })) as any;
      setSups(r.sups); setGerentes(r.gerentes); setProfiles(r.profiles); setGerCadastro(r.gerentesCadastro);
      const pr = (await produtosPrevisaoList({ data: { token } })) as ProdutoLite[];
      setProdutos(Array.isArray(pr) ? pr : []);
      // Empreendimentos sem produto vinculado
      const vl = (await vendasList({ data: { token } })) as { vendas: Venda[] };
      const contagem = new Map<string, { nome: string; count: number }>();
      for (const v of vl.vendas ?? []) {
        const nome = (v.empreendimento ?? "").trim();
        if (!nome) continue;
        const k = nome.toLowerCase();
        const e = contagem.get(k);
        if (e) e.count += 1; else contagem.set(k, { nome, count: 1 });
      }
      const nomes = Array.from(contagem.values()).map((x) => x.nome);
      if (nomes.length === 0) {
        setEmpsSemProd([]);
      } else {
        const sgRes = (await produtoAliasesSugerir({ data: { token, nomes } })) as { items: { nome: string; norm: string; produto_id: string | null; suggested_produto_id: string | null }[] };
        const semProd = (sgRes.items ?? [])
          .filter((s) => !s.produto_id)
          .map((s) => ({
            nome: s.nome,
            norm: s.norm,
            suggested_produto_id: s.suggested_produto_id,
            count: contagem.get(s.nome.toLowerCase())?.count ?? 0,
          }))
          .sort((a, b) => b.count - a.count);
        setEmpsSemProd(semProd);
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [token]);

  async function saveSup(alias: string, profile_id: string) {
    setWorking(`sup:${alias}`);
    try { await hierarquiaAliasUpsert({ data: { token, tipo: "superintendente", alias, profile_id } }); toast.success("Vínculo salvo"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }
  async function saveGer(alias: string, gerente_id: string) {
    setWorking(`ger:${alias}`);
    try { await hierarquiaAliasUpsert({ data: { token, tipo: "gerente", alias, gerente_id } }); toast.success("Vínculo salvo"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }
  async function removerSup(alias_normalizado: string) {
    setWorking(`sup:${alias_normalizado}`);
    try { await hierarquiaAliasDelete({ data: { token, tipo: "superintendente", alias_normalizado } }); toast.success("Vínculo removido"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }
  async function removerGer(alias_normalizado: string) {
    setWorking(`ger:${alias_normalizado}`);
    try { await hierarquiaAliasDelete({ data: { token, tipo: "gerente", alias_normalizado } }); toast.success("Vínculo removido"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }

  const supsPend = sups.filter((s) => !s.profile_id).length;
  const gerPend = gerentes.filter((g) => !g.gerente_id).length;

  async function criarProduto() {
    const nome = novoProd.trim();
    if (!nome) return;
    setProdBusy("__novo__");
    try {
      await produtoPrevisaoCreate({ data: { token, nome } });
      setNovoProd("");
      toast.success("Produto adicionado");
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setProdBusy(null); }
  }
  async function removerProduto(id: string) {
    if (!confirm("Remover este produto?")) return;
    setProdBusy(id);
    try {
      await produtoPrevisaoDelete({ data: { token, id } });
      toast.success("Produto removido");
      await reload();
    } catch (e: any) {
      // fallback: se não puder deletar (em uso), apenas inativa
      try {
        await produtoPrevisaoToggleAtivo({ data: { token, id, ativo: false } });
        toast.success("Produto inativado");
        await reload();
      } catch (e2: any) { toast.error(e2?.message ?? e?.message ?? "Falha"); }
    }
    finally { setProdBusy(null); }
  }
  async function toggleAtivo(id: string, ativo: boolean) {
    setProdBusy(id);
    try {
      await produtoPrevisaoToggleAtivo({ data: { token, id, ativo } });
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setProdBusy(null); }
  }

  async function vincularEmp(emp: { nome: string; norm: string }) {
    const escolha = empSel[emp.norm];
    if (!escolha) { toast.error("Selecione um produto"); return; }
    setEmpBusy(emp.norm);
    try {
      let produto_id = escolha;
      if (escolha === "__novo__") {
        const nomeNovo = (empNovoNome[emp.norm] ?? "").trim();
        if (!nomeNovo) { toast.error("Informe o nome do novo produto"); setEmpBusy(null); return; }
        const r = (await produtoPrevisaoCreate({ data: { token, nome: nomeNovo } })) as { id: string };
        produto_id = r.id;
      }
      await produtoAliasUpsert({ data: { token, produto_id, alias: emp.nome } });
      toast.success("Empreendimento vinculado");
      setEmpSel((m) => { const n = { ...m }; delete n[emp.norm]; return n; });
      setEmpNovoNome((m) => { const n = { ...m }; delete n[emp.norm]; return n; });
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setEmpBusy(null); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-secondary">Vínculos da hierarquia</CardTitle>
          <p className="text-xs text-muted-foreground">Vincule cada superintendente e gerente que aparece nas bases importadas a um usuário cadastrado.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Sups: {sups.length - supsPend}/{sups.length}</Badge>
          <Badge variant="outline">Gerentes: {gerentes.length - gerPend}/{gerentes.length}</Badge>
          <Badge variant="outline">Produtos: {produtos.length}</Badge>
          <Badge variant={empsSemProd.length > 0 ? "destructive" : "outline"}>Empreend. sem produto: {empsSemProd.length}</Badge>
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading} className="ml-auto h-7">
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Recarregar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-secondary">Empreendimentos sem produto ({empsSemProd.length})</CardTitle>
          <p className="text-xs text-muted-foreground">Empreendimentos importados nas vendas que ainda não estão vinculados a nenhum produto. Escolha um produto existente ou crie um novo.</p>
        </CardHeader>
        <CardContent>
          {empsSemProd.length === 0 ? (
            <div className="text-sm text-muted-foreground">Todos os empreendimentos já estão vinculados.</div>
          ) : (
            <div className="divide-y">
              {empsSemProd.map((emp) => {
                const sel = empSel[emp.norm] ?? emp.suggested_produto_id ?? "";
                const isNovo = sel === "__novo__";
                const busy = empBusy === emp.norm;
                return (
                  <div key={emp.norm} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-sm font-medium">{emp.nome}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {emp.count} venda{emp.count === 1 ? "" : "s"}
                        {emp.suggested_produto_id && !empSel[emp.norm] ? " · sugestão automática" : ""}
                      </div>
                    </div>
                    <Select value={sel} onValueChange={(v) => setEmpSel((m) => ({ ...m, [emp.norm]: v }))}>
                      <SelectTrigger className={`w-[240px] ${emp.suggested_produto_id && !empSel[emp.norm] ? "border-amber-500/50" : ""}`}>
                        <SelectValue placeholder="Escolher produto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.filter((p) => p.ativo !== false).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                        <SelectItem value="__novo__">+ Criar novo produto…</SelectItem>
                      </SelectContent>
                    </Select>
                    {isNovo && (
                      <Input
                        placeholder="Nome do novo produto"
                        value={empNovoNome[emp.norm] ?? emp.nome}
                        onChange={(e) => setEmpNovoNome((m) => ({ ...m, [emp.norm]: e.target.value }))}
                        className="w-[220px]"
                      />
                    )}
                    <Button size="sm" disabled={!sel || busy} onClick={() => vincularEmp(emp)}>
                      <Check className="h-4 w-4 mr-1" /> Salvar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-secondary">Produtos da previsão ({produtos.length})</CardTitle>
          <p className="text-xs text-muted-foreground">Adicione ou remova produtos usados nas previsões e na importação de vendas.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Nome do novo produto"
              value={novoProd}
              onChange={(e) => setNovoProd(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criarProduto(); } }}
              className="max-w-sm"
            />
            <Button size="sm" onClick={criarProduto} disabled={!novoProd.trim() || prodBusy === "__novo__"}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          {produtos.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum produto cadastrado.</div>
          ) : (
            <div className="divide-y">
              {produtos.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.nome}</div>
                    <div className="text-[11px] text-muted-foreground">{p.ativo === false ? "Inativo" : "Ativo"}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={prodBusy === p.id}
                    onClick={() => toggleAtivo(p.id, !(p.ativo !== false))}
                  >
                    {p.ativo === false ? "Ativar" : "Inativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={prodBusy === p.id}
                    onClick={() => removerProduto(p.id)}
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base text-secondary">Superintendentes ({sups.length})</CardTitle></CardHeader>
        <CardContent>
          {sups.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum superintendente nas bases.</div> : (
            <div className="divide-y">
              {sups.map((s) => (
                <SupAliasRowUI key={s.alias_normalizado} row={s} profiles={profiles}
                  busy={working === `sup:${s.alias}` || working === `sup:${s.alias_normalizado}`}
                  onSave={(pid) => saveSup(s.alias, pid)}
                  onRemove={() => removerSup(s.alias_normalizado)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base text-secondary">Gerentes ({gerentes.length})</CardTitle></CardHeader>
        <CardContent>
          {gerentes.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum gerente nas bases.</div> : (
            <div className="divide-y">
              {gerentes.map((g) => (
                <GerAliasRowUI key={g.alias_normalizado} row={g} gerentes={gerCadastro} profiles={profiles}
                  busy={working === `ger:${g.alias}` || working === `ger:${g.alias_normalizado}`}
                  onSave={(gid) => saveGer(g.alias, gid)}
                  onRemove={() => removerGer(g.alias_normalizado)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SupAliasRowUI({ row, profiles, busy, onSave, onRemove }: { row: SupAliasRow; profiles: ProfileRef[]; busy: boolean; onSave: (pid: string) => void; onRemove: () => void }) {
  const initial = row.profile_id ?? row.suggested_profile_id ?? "";
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(row.profile_id ?? row.suggested_profile_id ?? ""); }, [row.profile_id, row.suggested_profile_id]);
  const isSug = !row.profile_id && !!row.suggested_profile_id;
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium">{row.alias}</div>
        <div className="text-[11px] text-muted-foreground">{row.profile_id ? "Vinculado" : isSug ? "Sugestão" : "Pendente"}</div>
      </div>
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className={`w-[220px] ${isSug && !row.profile_id ? "border-amber-500/50" : ""}`}><SelectValue placeholder="Escolher..." /></SelectTrigger>
        <SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" disabled={!val || busy || val === row.profile_id} onClick={() => onSave(val)}>
        <Check className="h-4 w-4 mr-1" /> {row.profile_id ? "Atualizar" : "Confirmar"}
      </Button>
      {row.profile_id && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
      )}
    </div>
  );
}

function GerAliasRowUI({ row, gerentes, profiles, busy, onSave, onRemove }: { row: GerAliasRow; gerentes: GerenteRef[]; profiles: ProfileRef[]; busy: boolean; onSave: (gid: string) => void; onRemove: () => void }) {
  const initial = row.gerente_id ?? row.suggested_gerente_id ?? "";
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(row.gerente_id ?? row.suggested_gerente_id ?? ""); }, [row.gerente_id, row.suggested_gerente_id]);
  const isSug = !row.gerente_id && !!row.suggested_gerente_id;
  const supById = useMemo(() => new Map(profiles.map((p) => [p.id, p.nome])), [profiles]);
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium">{row.alias}</div>
        <div className="text-[11px] text-muted-foreground">{row.gerente_id ? "Vinculado" : isSug ? "Sugestão" : "Pendente"}</div>
      </div>
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className={`w-[260px] ${isSug && !row.gerente_id ? "border-amber-500/50" : ""}`}><SelectValue placeholder="Escolher..." /></SelectTrigger>
        <SelectContent>
          {gerentes.map((g) => (
            <SelectItem key={g.id} value={g.id}>{g.nome} <span className="opacity-60">— {supById.get(g.superintendente_id) ?? "?"}</span></SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!val || busy || val === row.gerente_id} onClick={() => onSave(val)}>
        <Check className="h-4 w-4 mr-1" /> {row.gerente_id ? "Atualizar" : "Confirmar"}
      </Button>
      {row.gerente_id && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
      )}
    </div>
  );
}

// ============ Previsões lançadas (lista + editar + excluir) ============
function PrevisoesLancadasCard({ token, isAdmin, previsoes, onChange }: { token: string; isAdmin: boolean; previsoes: Previsao[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Previsao | null>(null);
  const [editQtd, setEditQtd] = useState("");
  const [editObs, setEditObs] = useState("");
  const [editGer, setEditGer] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...previsoes].sort((a, b) => (b.semana_inicio ?? "").localeCompare(a.semana_inicio ?? "")),
    [previsoes]
  );

  function startEdit(p: Previsao) {
    setEditing(p);
    setEditQtd(String(p.preciso_vendas ?? 0));
    setEditObs(p.observacao ?? "");
    setEditGer(p.gerente ?? "");
  }

  async function salvar() {
    if (!editing) return;
    const qtd = parseNumber(editQtd);
    if (qtd < 0) { toast.error("Quantidade inválida"); return; }
    setSaving(true);
    try {
      await previsaoUpdate({ data: { token, id: editing.id, preciso_vendas: qtd, gerente: editGer.trim() || null, observacao: editObs.trim() || null } });
      toast.success("Previsão atualizada");
      setEditing(null);
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar");
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id: string) {
    setDeletingId(id);
    try {
      await previsaoDelete({ data: { token, id } });
      toast.success("Previsão excluída");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className={cyberTableCard}>
      <CardHeader><CardTitle className={cyberTableTitle}>// PREVISÕES LANÇADAS ({ordered.length})</CardTitle></CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma previsão lançada.</p>
        ) : (
          <div className="overflow-auto">
            <Table className={cyberTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Superintendente</TableHead>
                  <TableHead>Gerente</TableHead>
                  <TableHead className="text-right">Previsto</TableHead>
                  <TableHead>Observação</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {p.semana_inicio ? fmtDateBR(p.semana_inicio) : "—"}
                      {p.semana_fim ? ` a ${fmtDateBR(p.semana_fim)}` : ""}
                    </TableCell>
                    <TableCell className="text-sm">{p.superintendente ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.gerente ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmtNum(Number(p.preciso_vendas || 0))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">{p.observacao ?? ""}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={deletingId === p.id}>
                                <Trash2 className="h-4 w-4 text-rose-600" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir previsão?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação é definitiva. {p.gerente ? `Gerente: ${p.gerente}.` : ""} Previsto: {fmtNum(Number(p.preciso_vendas || 0))}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => excluir(p.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar previsão</DialogTitle>
            <DialogDescription>
              {editing?.superintendente ?? ""} {editing?.semana_inicio ? ` — ${fmtDateBR(editing.semana_inicio)}${editing.semana_fim ? ` a ${fmtDateBR(editing.semana_fim)}` : ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Gerente</Label>
              <Input value={editGer} onChange={(e) => setEditGer(e.target.value)} placeholder="Nome do gerente" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quantidade prevista</Label>
              <Input type="number" inputMode="numeric" min={0} value={editQtd} onChange={(e) => setEditQtd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observação</Label>
              <Input value={editObs} onChange={(e) => setEditObs(e.target.value)} maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============ Tabela hierárquica: Produto -> Empreendimento ============
type EmpRow = { nome: string; produto_id: string | null; previsao: number; realizado: number; saldo: number; pct: number; unidades: number };
function ProdutoEmpreendimentoTable({ rows, produtos }: { rows: EmpRow[]; produtos: ProdutoLite[] }) {
  const prodNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of produtos) m.set(p.id, p.nome);
    return m;
  }, [produtos]);
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; nome: string; emps: EmpRow[]; realizado: number; previsao: number }>();
    for (const r of rows) {
      const key = r.produto_id ?? "__sem_produto__";
      const nome = r.produto_id ? (prodNome.get(r.produto_id) ?? "(produto removido)") : "Sem produto vinculado";
      if (!map.has(key)) map.set(key, { key, nome, emps: [], realizado: 0, previsao: 0 });
      const g = map.get(key)!;
      g.emps.push(r);
      g.realizado += r.realizado;
      g.previsao += r.previsao;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === "__sem_produto__") return 1;
      if (b.key === "__sem_produto__") return -1;
      return b.realizado - a.realizado;
    });
  }, [rows, prodNome]);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  return (
    <Table className={cyberTableClass}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Produto / Empreendimento</TableHead>
          <TableHead className={`text-right ${COL.previsao}`}>Previsão</TableHead>
          <TableHead className={`text-right ${COL.realizado}`}>Realizado</TableHead>
          <TableHead className={`text-right ${COL.saldo}`}>Saldo</TableHead>
          <TableHead className={`text-right whitespace-nowrap ${COL.pct}`}>% Realizado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => {
          const open = openMap[g.key] ?? false;
          const saldo = g.realizado - g.previsao;
          return (
            <>
              <TableRow key={g.key} className="bg-muted/40">
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setOpenMap((m) => ({ ...m, [g.key]: !open }))}
                    className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted"
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
                  </button>
                </TableCell>
                <TableCell className="font-semibold text-[#39FF14]">{g.nome} <span className="ml-1 text-xs text-muted-foreground">({g.emps.length})</span></TableCell>
                <TableCell className={`text-right font-mono ${COL.previsao}`}>{fmtNum(g.previsao)}</TableCell>
                <TableCell className={`text-right font-mono ${COL.realizado}`}>{fmtNumDec(g.realizado)}</TableCell>
                <TableCell className={`text-right font-mono ${COL.saldo}`} style={{ color: saldoColor(saldo) }}>{fmtNumDec(saldo)}</TableCell>
                <TableCell className={`text-right font-mono ${COL.pct}`} style={{ color: realizadoColor(g.realizado, g.previsao) }}>{fmtPct(g.realizado, g.previsao)}</TableCell>
              </TableRow>
              {open && g.emps.map((e) => (
                <TableRow key={`${g.key}-${e.nome}`}>
                  <TableCell></TableCell>
                  <TableCell className="pl-8 text-sm">{e.nome}</TableCell>
                  <TableCell className={`text-right font-mono ${COL.previsao}`}>{fmtNum(e.previsao)}</TableCell>
                  <TableCell className={`text-right font-mono ${COL.realizado}`}>{fmtNumDec(e.realizado)}</TableCell>
                  <TableCell className={`text-right font-mono ${COL.saldo}`} style={{ color: saldoColor(e.saldo) }}>{fmtNumDec(e.saldo)}</TableCell>
                  <TableCell className={`text-right font-mono ${COL.pct}`} style={{ color: realizadoColor(e.realizado, e.previsao) }}>{fmtPct(e.realizado, e.previsao)}</TableCell>
                </TableRow>
              ))}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
