import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useHierarquia } from "@/hooks/useHierarquia";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Upload, Trash2, FolderOpen, FileSpreadsheet, ChevronRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeft } from "lucide-react";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { CyberHeading } from "@/components/cyber/CyberHeading";

export const Route = createFileRoute("/_app/pastas")({
  component: PastasPage,
});

// Cores por label de coluna (não por índice):
const COL_BGS: Record<string, string> = {
  "PVs": "bg-[oklch(0.498_0.135_147.8/0.06)]",               // verde
  "PVs com AB": "bg-[oklch(0.582_0.222_359.84/0.05)]",        // rosa
  "%": "bg-[oklch(0.43_0.18_264.18/0.05)]",                   // azul
};
const COL_TEXT: Record<string, string> = {
  "PVs": "text-secondary",
  "PVs com AB": "text-primary",
  "%": "text-accent",
};
const COL_WIDTH: Record<string, string> = {
  "PVs": "w-24",
  "PVs com AB": "w-24",
  "%": "w-24",
};
const colBg = (label: string) => COL_BGS[label] || "";
const colText = (label: string) => COL_TEXT[label] || "text-foreground";
const colWidth = (label: string) => COL_WIDTH[label] || "";

type Pasta = {
  id: string;
  created_at: string;
  pv: string;
  diretor: string | null;
  superintendente: string | null;
  gerente: string | null;
  corretor: string | null;
  empreendimento: string | null;
  ab: string | null;
  data_criacao: string | null;
  status: string | null;
  diretor_id: string | null;
  superintendente_id: string | null;
  gerente_id: string | null;
};

const CAMPOS: { key: CampoKey; label: string; required?: boolean }[] = [
  { key: "pv", label: "PV", required: true },
  { key: "diretor", label: "Diretor" },
  { key: "superintendente", label: "Superintendente" },
  { key: "gerente", label: "Gerente" },
  { key: "corretor", label: "Corretor" },
  { key: "empreendimento", label: "Empreendimento" },
  { key: "ab", label: "AB" },
  { key: "data_criacao", label: "Data de Criação" },
  { key: "status", label: "Status" },
];

type CampoKey =
  | "pv"
  | "diretor"
  | "superintendente"
  | "gerente"
  | "corretor"
  | "empreendimento"
  | "ab"
  | "data_criacao"
  | "status";

function norm(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function autoMap(headers: string[]): Record<CampoKey, string> {
  const map: Record<string, string> = {};
  const candidates: Record<CampoKey, string[]> = {
    pv: ["pv", "numero pv", "n pv", "num pv", "proposta", "n proposta"],
    diretor: ["diretor"],
    superintendente: ["superintendente", "super", "sup"],
    gerente: ["gerente", "ger"],
    corretor: ["corretor", "consultor", "vendedor"],
    empreendimento: ["empreendimento", "obra", "produto"],
    ab: ["ab", "assinatura", "ass banco"],
    data_criacao: ["data criacao", "data de criacao", "criacao", "data", "data pv"],
    status: ["status", "situacao"],
  };
  for (const c of CAMPOS) {
    const cands = candidates[c.key];
    const found = headers.find((h) => {
      const n = norm(h);
      return cands.some((k) => n === k || n.includes(k));
    });
    if (found) map[c.key] = found;
  }
  return map as Record<CampoKey, string>;
}

function PastasPage() {
  const { isAdmin, isDiretor, loading } = useAuth();
  const navigate = useNavigate();
  const { diretores, superintendentes, gerentes } = useHierarquia();

  const [rows, setRows] = useState<Pasta[]>([]);
  const [batches, setBatches] = useState<{ id: string; created_at: string; count: number }[]>([]);
  const [busy, setBusy] = useState(false);


  // filtros
  const [fGerente, setFGerente] = useState("__all");
  const [fSup, setFSup] = useState("__all");
  const [fEmp, setFEmp] = useState("__all");
  const [fCorretor, setFCorretor] = useState("__all");
  const [fDataIni, setFDataIni] = useState("");
  const [fDataFim, setFDataFim] = useState("");
  const [viewResumo, setViewResumo] = useState<"emp" | "ger">("emp");
  

  // import
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<CampoKey, string>>({} as Record<CampoKey, string>);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin && !isDiretor) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, isAdmin, isDiretor, navigate]);

  const loadRows = async () => {
    const { data, error } = await supabase
      .from("pastas" as never)
      .select("*")
      .order("data_criacao", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      toast.error("Erro ao carregar pastas: " + error.message);
      return;
    }
    setRows((data as Pasta[]) ?? []);
  };

  const loadBatches = async () => {
    const { data, error } = await supabase
      .from("pastas" as never)
      .select("import_batch_id, created_at")
      .not("import_batch_id", "is", null)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar importações: " + error.message);
      return;
    }
    const map = new Map<string, { id: string; created_at: string; count: number }>();
    for (const r of (data as any[]) ?? []) {
      const bid = r.import_batch_id as string;
      const existing = map.get(bid);
      if (existing) {
        existing.count++;
        if (r.created_at > existing.created_at) existing.created_at = r.created_at;
      } else {
        map.set(bid, { id: bid, created_at: r.created_at, count: 1 });
      }
    }
    setBatches(Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  };

  useEffect(() => {
    if (isAdmin || isDiretor) {
      loadRows();
      loadBatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isDiretor]);

  const opGerentes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.gerente).filter(Boolean))) as string[],
    [rows],
  );
  const opSups = useMemo(
    () => Array.from(new Set(rows.map((r) => r.superintendente).filter(Boolean))) as string[],
    [rows],
  );
  const opEmps = useMemo(
    () => Array.from(new Set(rows.map((r) => r.empreendimento).filter(Boolean))) as string[],
    [rows],
  );
  const opCorretores = useMemo(
    () => Array.from(new Set(rows.map((r) => r.corretor).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fGerente !== "__all" && (r.gerente || "") !== fGerente) return false;
      if (fSup !== "__all" && (r.superintendente || "") !== fSup) return false;
      if (fEmp !== "__all" && (r.empreendimento || "") !== fEmp) return false;
      if (fCorretor !== "__all" && (r.corretor || "") !== fCorretor) return false;
      if (fDataIni && (!r.data_criacao || r.data_criacao < fDataIni)) return false;
      if (fDataFim && (!r.data_criacao || r.data_criacao > fDataFim)) return false;
      return true;
    });
  }, [rows, fGerente, fSup, fEmp, fCorretor, fDataIni, fDataFim]);

  const totalPv = filtered.length;
  const totalAb = filtered.filter((r) => {
    const s = (r.ab || "").toString().trim().toLowerCase();
    return s && s !== "nao" && s !== "não" && s !== "0" && s !== "false" && s !== "-";
  }).length;
  const totalEmpDistintos = new Set(filtered.map((r) => r.empreendimento).filter(Boolean)).size;
  const totalCorretoresDistintos = new Set(filtered.map((r) => r.corretor).filter(Boolean)).size;

  const onPickFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        toast.error("Planilha vazia");
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
      if (!json.length) {
        toast.error("Nenhuma linha encontrada");
        return;
      }
      const hs = Object.keys(json[0] as Record<string, unknown>);
      setHeaders(hs);
      setSheetRows(json);
      setMapping(autoMap(hs));
      setImportOpen(true);
    } catch (e: any) {
      toast.error("Falha ao ler arquivo: " + (e?.message || ""));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const profileByNome = useMemo(() => {
    const m = new Map<string, { id: string; cargo: "diretor" | "superintendente" }>();
    diretores.forEach((d) => m.set(norm(d.nome), { id: d.id, cargo: "diretor" }));
    superintendentes.forEach((s) => m.set(norm(s.nome), { id: s.id, cargo: "superintendente" }));
    return m;
  }, [diretores, superintendentes]);
  const gerenteByNome = useMemo(() => {
    const m = new Map<string, string>();
    gerentes.forEach((g) => m.set(norm(g.nome), g.id));
    return m;
  }, [gerentes]);

  const doImport = async () => {
    if (!mapping.pv) {
      toast.error("Coluna PV é obrigatória");
      return;
    }
    setBusy(true);
    try {
      const batchId = (globalThis.crypto as any)?.randomUUID?.() ?? null;
      const payload = sheetRows
        .map((r) => {
          const get = (k: CampoKey) => {
            const col = mapping[k];
            if (!col) return null;
            const v = r[col];
            if (v == null || v === "") return null;
            return typeof v === "string" ? v.trim() : v;
          };
          const pv = get("pv");
          if (!pv) return null;
          const diretor = get("diretor") as string | null;
          const sup = get("superintendente") as string | null;
          const ger = get("gerente") as string | null;
          const dirMatch = diretor ? profileByNome.get(norm(diretor)) : null;
          const supMatch = sup ? profileByNome.get(norm(sup)) : null;
          const gerMatch = ger ? gerenteByNome.get(norm(ger)) : null;
          return {
            pv: String(pv),
            diretor,
            superintendente: sup,
            gerente: ger,
            corretor: get("corretor") as string | null,
            empreendimento: get("empreendimento") as string | null,
            ab: get("ab") == null ? null : String(get("ab")),
            data_criacao: parseDate(get("data_criacao")),
            status: get("status") as string | null,
            diretor_id: dirMatch?.cargo === "diretor" ? dirMatch.id : null,
            superintendente_id: supMatch?.cargo === "superintendente" ? supMatch.id : null,
            gerente_id: gerMatch ?? null,
            import_batch_id: batchId,
          };
        })
        .filter(Boolean) as Record<string, unknown>[];

      if (!payload.length) {
        toast.error("Nenhuma linha válida (PV vazio)");
        return;
      }
      // chunked insert
      const chunk = 500;
      for (let i = 0; i < payload.length; i += chunk) {
        const { error } = await supabase.from("pastas" as never).insert(payload.slice(i, i + chunk) as never);
        if (error) throw error;
      }
      toast.success(`${payload.length} PVs importados`);
      setImportOpen(false);
      setHeaders([]);
      setSheetRows([]);
      setMapping({} as Record<CampoKey, string>);
      await loadRows();
      await loadBatches();
    } catch (e: any) {
      toast.error("Erro ao importar: " + (e?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const vincularDiretor = async (id: string, profId: string | null) => {
    const prof = diretores.find((d) => d.id === profId);
    const { error } = await supabase
      .from("pastas" as never)
      .update({ diretor_id: profId, diretor: prof?.nome ?? null } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    setRows((p) => p.map((r) => (r.id === id ? { ...r, diretor_id: profId, diretor: prof?.nome ?? r.diretor } : r)));
  };
  const vincularSup = async (id: string, profId: string | null) => {
    const prof = superintendentes.find((s) => s.id === profId);
    const { error } = await supabase
      .from("pastas" as never)
      .update({ superintendente_id: profId, superintendente: prof?.nome ?? null } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    setRows((p) => p.map((r) => (r.id === id ? { ...r, superintendente_id: profId, superintendente: prof?.nome ?? r.superintendente } : r)));
  };
  const vincularGerente = async (id: string, gerId: string | null) => {
    const g = gerentes.find((x) => x.id === gerId);
    const { error } = await supabase
      .from("pastas" as never)
      .update({ gerente_id: gerId, gerente: g?.nome ?? null } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    setRows((p) => p.map((r) => (r.id === id ? { ...r, gerente_id: gerId, gerente: g?.nome ?? r.gerente } : r)));
  };

  const excluir = async (id: string) => {
    const { error } = await supabase.from("pastas" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((p) => p.filter((r) => r.id !== id));
    toast.success("Excluído");
  };

  const limparTudo = async () => {
    const ids = filtered.map((r) => r.id);
    if (!ids.length) return;
    const { error } = await supabase.from("pastas" as never).delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} registros excluídos`);
    await loadRows();
  };

  const isAb = (v: string | null) => {
    const s = (v || "").toString().trim().toLowerCase();
    return !!s && s !== "nao" && s !== "não" && s !== "0" && s !== "false" && s !== "-";
  };

  const excluirBatch = async (batchId: string) => {
    const { error } = await supabase.from("pastas" as never).delete().eq("import_batch_id", batchId);
    if (error) return toast.error(error.message);
    toast.success("Importação excluída");
    await loadRows();
    await loadBatches();
  };

  // ===== Vínculo massivo por nome =====
  const bulkVincularSup = async (nome: string, profId: string | null) => {
    const prof = superintendentes.find((s) => s.id === profId);
    const targetIds = rows
      .filter((r) => norm(r.superintendente || "") === norm(nome))
      .map((r) => r.id);
    if (!targetIds.length) return;
    const { error } = await supabase
      .from("pastas" as never)
      .update({ superintendente_id: profId, superintendente: prof?.nome ?? nome } as never)
      .in("id", targetIds);
    if (error) return toast.error(error.message);
    setRows((p) =>
      p.map((r) =>
        targetIds.includes(r.id)
          ? { ...r, superintendente_id: profId, superintendente: prof?.nome ?? nome }
          : r,
      ),
    );
    toast.success(`${targetIds.length} pastas vinculadas`);
  };

  const bulkVincularGerente = async (nome: string, gerId: string | null) => {
    const g = gerentes.find((x) => x.id === gerId);
    const targetIds = rows
      .filter((r) => norm(r.gerente || "") === norm(nome))
      .map((r) => r.id);
    if (!targetIds.length) return;
    const { error } = await supabase
      .from("pastas" as never)
      .update({ gerente_id: gerId, gerente: g?.nome ?? nome } as never)
      .in("id", targetIds);
    if (error) return toast.error(error.message);
    setRows((p) =>
      p.map((r) =>
        targetIds.includes(r.id)
          ? { ...r, gerente_id: gerId, gerente: g?.nome ?? nome }
          : r,
      ),
    );
    toast.success(`${targetIds.length} pastas vinculadas`);
  };

  // ===== Agregações de resumo =====
  const resumoSup = useMemo(() => {
    const m = new Map<string, { sup: string; pvs: number; abs: number }>();
    for (const r of filtered) {
      const k = r.superintendente || "(Sem Sup)";
      const cur = m.get(k) || { sup: k, pvs: 0, abs: 0 };
      cur.pvs++;
      if (isAb(r.ab)) cur.abs++;
      m.set(k, cur);
    }
    return Array.from(m.values());
  }, [filtered]);

  const resumoGerente = useMemo(() => {
    const m = new Map<string, { gerente: string; sup: string; pvs: number; abs: number }>();
    for (const r of filtered) {
      const k = (r.gerente || "(Sem Gerente)") + "||" + (r.superintendente || "");
      const cur =
        m.get(k) || {
          gerente: r.gerente || "(Sem Gerente)",
          sup: r.superintendente || "(Sem Sup)",
          pvs: 0,
          abs: 0,
        };
      cur.pvs++;
      if (isAb(r.ab)) cur.abs++;
      m.set(k, cur);
    }
    return Array.from(m.values());
  }, [filtered]);

  const resumoEmp = useMemo(() => {
    const m = new Map<string, { emp: string; pvs: number; abs: number }>();
    for (const r of filtered) {
      const k = r.empreendimento || "(Sem Empreendimento)";
      const cur = m.get(k) || { emp: k, pvs: 0, abs: 0 };
      cur.pvs++;
      if (isAb(r.ab)) cur.abs++;
      m.set(k, cur);
    }
    return Array.from(m.values());
  }, [filtered]);

  // ===== Grupos para vínculo massivo =====
  const supGroups = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number; vinculados: number; profId: string | null }>();
    for (const r of rows) {
      const nome = (r.superintendente || "").trim();
      if (!nome) continue;
      const k = norm(nome);
      const cur =
        m.get(k) || { nome, qtd: 0, vinculados: 0, profId: r.superintendente_id };
      cur.qtd++;
      if (r.superintendente_id) {
        cur.vinculados++;
        cur.profId = r.superintendente_id;
      }
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.qtd - a.qtd);
  }, [rows]);

  const gerGroups = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number; vinculados: number; gerId: string | null }>();
    for (const r of rows) {
      const nome = (r.gerente || "").trim();
      if (!nome) continue;
      const k = norm(nome);
      const cur = m.get(k) || { nome, qtd: 0, vinculados: 0, gerId: r.gerente_id };
      cur.qtd++;
      if (r.gerente_id) {
        cur.vinculados++;
        cur.gerId = r.gerente_id;
      }
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.qtd - a.qtd);
  }, [rows]);

  if (loading) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (!isAdmin && !isDiretor) return null;

  return (
    <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10">
      <CyberBackdrop />
      <div className="relative z-10 space-y-5">
      <CyberHeading
        kicker="PASTAS"
        title="Pastas"
        subtitle="Importação e vinculação de PVs"
        right={
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/painel"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
          </Button>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
        }}
      />

      {/* Filtros (compartilhados) */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label className="text-xs">Gerente</Label>
          <Select value={fGerente} onValueChange={setFGerente}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              {opGerentes.sort().map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Superintendente</Label>
          <Select value={fSup} onValueChange={setFSup}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              {opSups.sort().map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Empreendimento</Label>
          <Select value={fEmp} onValueChange={setFEmp}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              {opEmps.sort().map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Corretor</Label>
          <Select value={fCorretor} onValueChange={setFCorretor}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              {opCorretores.sort().map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">Data de</Label>
            <Input lang="pt-BR" type="date" value={fDataIni} onChange={(e) => setFDataIni(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Data até</Label>
            <Input lang="pt-BR" type="date" value={fDataFim} onChange={(e) => setFDataFim(e.target.value)} />
          </div>
        </div>
      </div>


      <Tabs defaultValue="resumo">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="importar">Importar base</TabsTrigger>
          <TabsTrigger value="importacoes">Importações</TabsTrigger>
          <TabsTrigger value="vinculo">Vínculo</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-primary shadow-sm"><CardContent className="pt-5">
              <div className="text-xs uppercase text-primary font-semibold">PVs</div>
              <div className="text-2xl font-bold text-foreground">{totalPv}</div>
            </CardContent></Card>
            <Card className="border-l-4 border-l-secondary shadow-sm"><CardContent className="pt-5">
              <div className="text-xs uppercase text-secondary font-semibold">PVs com AB</div>
              <div className="text-2xl font-bold text-foreground">{totalAb}</div>
              <div className="text-xs text-muted-foreground">{totalPv ? `${Math.round((totalAb / totalPv) * 100)}%` : "—"}</div>
            </CardContent></Card>
            <Card className="border-l-4 border-l-accent shadow-sm"><CardContent className="pt-5">
              <div className="text-xs uppercase text-accent font-semibold">Empreendimentos</div>
              <div className="text-2xl font-bold text-foreground">{totalEmpDistintos}</div>
            </CardContent></Card>
            <Card className="border-l-4 border-l-primary/70 shadow-sm"><CardContent className="pt-5">
              <div className="text-xs uppercase text-primary/80 font-semibold">Corretores</div>
              <div className="text-2xl font-bold text-foreground">{totalCorretoresDistintos}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-2">
              <div className="text-sm font-bold text-secondary">Por Superintendente (clique para expandir gerentes)</div>
              <ResumoSupTable sups={resumoSup} gerentes={resumoGerente} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-secondary">
                  {viewResumo === "emp" ? "Por Empreendimento" : "Por Gerente"}
                </div>
                <div className="inline-flex rounded-md border bg-muted/30 p-1">
                  <Button
                    size="sm"
                    variant={viewResumo === "emp" ? "default" : "ghost"}
                    className="h-8"
                    onClick={() => setViewResumo("emp")}
                  >
                    Ver por empreendimento
                  </Button>
                  <Button
                    size="sm"
                    variant={viewResumo === "ger" ? "default" : "ghost"}
                    className="h-8"
                    onClick={() => setViewResumo("ger")}
                  >
                    Ver por gerente
                  </Button>
                </div>
              </div>
              {viewResumo === "emp" ? (
                <SortableTable
                  rows={resumoEmp}
                  columns={[
                    { key: "emp", label: "Empreendimento" },
                    { key: "pvs", label: "PVs", align: "right" },
                    { key: "abs", label: "PVs com AB", align: "right" },
                    {
                      key: "pct",
                      label: "%",
                      align: "right",
                      accessor: (r) => (r.pvs ? r.abs / r.pvs : 0),
                      render: (r) => (r.pvs ? `${Math.round((r.abs / r.pvs) * 100)}%` : "—"),
                    },
                  ]}
                  initialSort={{ key: "pvs", dir: "desc" }}
                />
              ) : (
                <SortableTable
                  rows={resumoGerente}
                  columns={[
                    { key: "gerente", label: "Gerente" },
                    { key: "sup", label: "Superintendente" },
                    { key: "pvs", label: "PVs", align: "right" },
                    { key: "abs", label: "PVs com AB", align: "right" },
                    {
                      key: "pct",
                      label: "%",
                      align: "right",
                      accessor: (r) => (r.pvs ? r.abs / r.pvs : 0),
                      render: (r) => (r.pvs ? `${Math.round((r.abs / r.pvs) * 100)}%` : "—"),
                    },
                  ]}
                  initialSort={{ key: "pvs", dir: "desc" }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="importar" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-accent rounded-lg p-2">
                  <FileSpreadsheet className="h-8 w-8 text-white shrink-0" />
                </div>
                <div className="space-y-1">
                  <div className="text-base font-bold text-secondary">Importar base de pastas</div>
                  <p className="text-sm text-muted-foreground">
                    Envie um arquivo Excel (.xlsx, .xls) ou CSV. Após o upload, você poderá
                    vincular cada coluna do arquivo aos campos do sistema (PV, Diretor,
                    Superintendente, Gerente, Corretor, Empreendimento, AB, Data, Status).
                  </p>
                </div>
              </div>
              <div>
                <Button onClick={() => fileRef.current?.click()} className="bg-accent hover:bg-accent/90">
                  <Upload className="mr-2 h-4 w-4" /> Importar planilha
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="importacoes" className="space-y-3">
          <Card>
            <CardContent className="pt-5 space-y-2">
              <div className="text-sm font-bold text-secondary">Importações realizadas</div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className={`font-semibold ${colText("Data")} ${colBg("Data")}`}>Data</TableHead>
                      <TableHead className={`text-right font-semibold ${colText("Pastas")} ${colBg("Pastas")}`}>Pastas</TableHead>
                      <TableHead className={`text-right font-semibold ${colText("Ações")} ${colBg("Ações")}`}>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Nenhuma importação encontrada.
                        </TableCell>
                      </TableRow>
                    )}
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className={`whitespace-nowrap ${colBg("Data")}`}>
                          {new Date(b.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${colBg("Pastas")}`}>{b.count}</TableCell>
                        <TableCell className={`text-right ${colBg("Ações")}`}>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação remove permanentemente {b.count} pastas importadas neste lote.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => excluirBatch(b.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vinculo" className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Vincule todas as pastas de cada nome importado de uma só vez. A vinculação afeta todas
            as pastas (independente dos filtros) cujo nome corresponde.
          </div>

          <Card>
            <CardContent className="pt-5 space-y-2">
              <div className="text-sm font-bold text-secondary">Superintendentes</div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className={`font-semibold ${colText("Nome importado")} ${colBg("Nome importado")}`}>Nome importado</TableHead>
                      <TableHead className={`text-right font-semibold ${colText("Pastas")} ${colBg("Pastas")}`}>Pastas</TableHead>
                      <TableHead className={`text-right font-semibold ${colText("Vinculadas")} ${colBg("Vinculadas")}`}>Vinculadas</TableHead>
                      <TableHead className={`font-semibold ${colText("Vincular a")} ${colBg("Vincular a")}`}>Vincular a</TableHead>
                    </TableRow>
                   </TableHeader>
                  <TableBody>
                    {supGroups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          Nenhum superintendente importado.
                        </TableCell>
                      </TableRow>
                    )}
                    {supGroups.map((g) => (
                      <TableRow key={g.nome}>
                        <TableCell className={`font-medium ${colBg("Nome importado")}`}>{g.nome}</TableCell>
                        <TableCell className={`text-right tabular-nums ${colBg("Pastas")}`}>{g.qtd}</TableCell>
                        <TableCell className={`text-right tabular-nums ${colBg("Vinculadas")}`}>
                          {g.vinculados}/{g.qtd}
                        </TableCell>
                        <TableCell className={colBg("Vincular a")}>
                          <VincSelect
                            value={g.profId}
                            label={null}
                            options={superintendentes.map((s) => ({ id: s.id, nome: s.nome }))}
                            onChange={(v) => bulkVincularSup(g.nome, v)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-2">
              <div className="text-sm font-bold text-secondary">Gerentes</div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className={`font-semibold ${colText("Nome importado")} ${colBg("Nome importado")}`}>Nome importado</TableHead>
                      <TableHead className={`text-right font-semibold ${colText("Pastas")} ${colBg("Pastas")}`}>Pastas</TableHead>
                      <TableHead className={`text-right font-semibold ${colText("Vinculadas")} ${colBg("Vinculadas")}`}>Vinculadas</TableHead>
                      <TableHead className={`font-semibold ${colText("Vincular a")} ${colBg("Vincular a")}`}>Vincular a</TableHead>
                    </TableRow>
                   </TableHeader>
                  <TableBody>
                    {gerGroups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          Nenhum gerente importado.
                        </TableCell>
                      </TableRow>
                    )}
                    {gerGroups.map((g) => (
                      <TableRow key={g.nome}>
                        <TableCell className={`font-medium ${colBg("Nome importado")}`}>{g.nome}</TableCell>
                        <TableCell className={`text-right tabular-nums ${colBg("Pastas")}`}>{g.qtd}</TableCell>
                        <TableCell className={`text-right tabular-nums ${colBg("Vinculadas")}`}>
                          {g.vinculados}/{g.qtd}
                        </TableCell>
                        <TableCell className={colBg("Vincular a")}>
                          <VincSelect
                            value={g.gerId}
                            label={null}
                            options={gerentes.map((x) => ({ id: x.id, nome: x.nome }))}
                            onChange={(v) => bulkVincularGerente(g.nome, v)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de importação */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Vincular colunas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">
              {sheetRows.length} linhas detectadas. Vincule cada campo à coluna correspondente.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS.map((c) => (
                <div key={c.key}>
                  <Label className="text-xs">
                    {c.label}{c.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[c.key] || "__none"}
                    onValueChange={(v) =>
                      setMapping((p) => ({ ...p, [c.key]: v === "__none" ? "" : v }))
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione a coluna" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Não usar —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {sheetRows.length > 0 && mapping.pv && (
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-xs font-medium mb-1">Preview (primeiras 3 linhas)</div>
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr>
                        {CAMPOS.filter((c) => mapping[c.key]).map((c) => (
                          <th key={c.key} className="px-2 py-1 text-left">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheetRows.slice(0, 3).map((r, i) => (
                        <tr key={i} className="border-t">
                          {CAMPOS.filter((c) => mapping[c.key]).map((c) => (
                            <td key={c.key} className="px-2 py-1">{String(r[mapping[c.key]] ?? "—")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={doImport} disabled={busy || !mapping.pv}>
              {busy ? "Importando…" : `Importar ${sheetRows.length} linhas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}

function VincSelect({
  value,
  label,
  options,
  onChange,
}: {
  value: string | null;
  label: string | null;
  options: { id: string; nome: string }[];
  onChange: (id: string | null) => void;
}) {
  const v = value ?? "__none";
  return (
    <div className="flex items-center gap-1">
      <Select value={v} onValueChange={(x) => onChange(x === "__none" ? null : x)}>
        <SelectTrigger className="h-8 min-w-[180px] text-xs">
          <SelectValue placeholder={label ? `${label} (vincular)` : "Vincular…"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">
            {label ? `${label} (não vinculado)` : "— Não vinculado —"}
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Apagar vínculo"
          onClick={() => onChange(null)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

type SortCol<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  accessor?: (r: T) => string | number;
  render?: (r: T) => React.ReactNode;
};

function SortableTable<T extends Record<string, unknown>>({
  rows,
  columns,
  initialSort,
}: {
  rows: T[];
  columns: SortCol<T>[];
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>(
    initialSort ?? { key: columns[0]?.key ?? "", dir: "asc" },
  );
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const acc = (r: T) => (col.accessor ? col.accessor(r) : (r as any)[col.key]);
    const arr = [...rows].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true });
    });
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={`cursor-pointer select-none font-semibold ${c.align === "right" ? "text-right" : ""} ${colText(c.label)} ${colBg(c.label)} ${colWidth(c.label)}`}
                  onClick={() => toggle(c.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sort.key === c.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-6">
                  Sem dados.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={`${c.align === "right" ? "text-right tabular-nums" : ""} ${colBg(c.label)} ${colWidth(c.label)}`}>
                    {c.render ? c.render(r) : String((r as any)[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
      </Table>
    </div>
  );
}

function ResumoSupTable({
  sups,
  gerentes,
}: {
  sups: { sup: string; pvs: number; abs: number }[];
  gerentes: { gerente: string; sup: string; pvs: number; abs: number }[];
}) {
  const [sort, setSort] = useState<{ key: "sup" | "pvs" | "abs" | "pct"; dir: "asc" | "desc" }>({
    key: "pvs",
    dir: "desc",
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const sorted = useMemo(() => {
    const acc = (r: { sup: string; pvs: number; abs: number }) =>
      sort.key === "sup" ? r.sup : sort.key === "pct" ? (r.pvs ? r.abs / r.pvs : 0) : r[sort.key];
    const arr = [...sups].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
    });
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [sups, sort]);

  const toggleSort = (key: typeof sort.key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const sortIcon = (key: typeof sort.key) =>
    sort.key === key ? (
      sort.dir === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )
    ) : (
      <ArrowUpDown className="h-3 w-3 opacity-40" />
    );

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-8" />
            <TableHead className={`cursor-pointer select-none font-semibold ${colText("Superintendente")} ${colBg("Superintendente")}`} onClick={() => toggleSort("sup")}>
              <span className="inline-flex items-center gap-1">Superintendente {sortIcon("sup")}</span>
            </TableHead>
            <TableHead className={`text-right cursor-pointer select-none font-semibold w-24 ${colText("PVs")} ${colBg("PVs")}`} onClick={() => toggleSort("pvs")}>
              <span className="inline-flex items-center gap-1">PVs {sortIcon("pvs")}</span>
            </TableHead>
            <TableHead className={`text-right cursor-pointer select-none font-semibold w-24 ${colText("PVs com AB")} ${colBg("PVs com AB")}`} onClick={() => toggleSort("abs")}>
              <span className="inline-flex items-center gap-1">PVs com AB {sortIcon("abs")}</span>
            </TableHead>
            <TableHead className={`text-right cursor-pointer select-none font-semibold w-24 ${colText("%")} ${colBg("%")}`} onClick={() => toggleSort("pct")}>
              <span className="inline-flex items-center gap-1">% {sortIcon("pct")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                Sem dados.
              </TableCell>
            </TableRow>
          )}
          {sorted.map((s, idx) => {
            const isOpen = !!open[s.sup];
            const gers = gerentes
              .filter((g) => g.sup === s.sup)
              .sort((a, b) => b.pvs - a.pvs);
            const out: ReactNode[] = [
                <TableRow
                  key={s.sup}
                  className="cursor-pointer"
                  onClick={() => setOpen((p) => ({ ...p, [s.sup]: !p[s.sup] }))}
                >
                  <TableCell>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell className={`font-medium ${colBg("Superintendente")}`}>{s.sup}</TableCell>
                  <TableCell className={`text-right tabular-nums w-24 ${colBg("PVs")}`}>{s.pvs}</TableCell>
                  <TableCell className={`text-right tabular-nums w-24 ${colBg("PVs com AB")}`}>{s.abs}</TableCell>
                  <TableCell className={`text-right tabular-nums w-24 ${colBg("%")}`}>
                    {s.pvs ? `${Math.round((s.abs / s.pvs) * 100)}%` : "—"}
                  </TableCell>
                </TableRow>,
            ];
            if (isOpen) {
              for (const g of gers) {
                out.push(
                  <TableRow key={s.sup + "::" + g.gerente} className="bg-muted/30">
                    <TableCell />
                    <TableCell className={`pl-8 text-sm ${colBg("Superintendente")}`}>↳ {g.gerente}</TableCell>
                    <TableCell className={`text-right tabular-nums w-24 ${colBg("PVs")}`}>{g.pvs}</TableCell>
                    <TableCell className={`text-right tabular-nums w-24 ${colBg("PVs com AB")}`}>{g.abs}</TableCell>
                    <TableCell className={`text-right tabular-nums w-24 ${colBg("%")}`}>
                      {g.pvs ? `${Math.round((g.abs / g.pvs) * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>,
                );
              }
            }
            return out;
          })}
        </TableBody>
      </Table>
    </div>
  );
}