import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useHierarquia } from "@/hooks/useHierarquia";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Paperclip, Pencil, Plus, Trash2, Upload, FileText, X, Link2, ChevronLeft, ChevronRight, Check, SkipForward } from "lucide-react";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { CyberBackdrop } from "@/components/CyberBackdrop";

type Comprovante = { url: string; nome: string; mime: string };
type TipoGasto = "manutencao" | "gerar_venda";
type DestinoTipo = "diretor" | "superintendente";

type Lancamento = {
  id: string;
  created_at: string;
  mes: number;
  ano: number;
  destino_tipo: DestinoTipo;
  destino_id: string | null;
  destino_nome: string;
  gerente_id: string | null;
  gerente_nome: string | null;
  descricao: string | null;
  valor: number;
  tipo_gasto: TipoGasto;
  comprovantes: Comprovante[];
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const Route = createFileRoute("/_app/financeiro")({
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const { isAdmin, isDiretor, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Lancamento[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filtroAno, setFiltroAno] = useState<string>(String(new Date().getFullYear()));
  const [filtroMes, setFiltroMes] = useState<string>("todos");
  const [filtroDestino, setFiltroDestino] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroGerente, setFiltroGerente] = useState<string>("todos");

  useEffect(() => {
    if (!loading && !(isAdmin || isDiretor)) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, isAdmin, isDiretor, navigate]);

  const reload = async () => {
    setLoadingList(true);
    const { data, error } = await (supabase as any)
      .from("lancamentos_financeiros")
      .select("*")
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar lançamentos: " + error.message);
    } else {
      setItems((data ?? []) as Lancamento[]);
    }
    setLoadingList(false);
  };

  useEffect(() => {
    if (!loading && (isAdmin || isDiretor)) reload();
  }, [loading, isAdmin, isDiretor]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filtroAno !== "todos" && String(i.ano) !== filtroAno) return false;
      if (filtroMes !== "todos" && String(i.mes) !== filtroMes) return false;
      if (filtroDestino !== "todos" && i.destino_tipo !== filtroDestino) return false;
      if (filtroTipo !== "todos" && i.tipo_gasto !== filtroTipo) return false;
      if (filtroGerente !== "todos") {
        if (filtroGerente === "__sem__") {
          if (i.gerente_nome) return false;
        } else if ((i.gerente_nome || "") !== filtroGerente) return false;
      }
      return true;
    });
  }, [items, filtroAno, filtroMes, filtroDestino, filtroTipo, filtroGerente]);

  const total = useMemo(() => filtered.reduce((s, i) => s + Number(i.valor || 0), 0), [filtered]);
  const anosUnicos = useMemo(() => {
    const set = new Set(items.map((i) => i.ano));
    return Array.from(set).sort((a, b) => b - a);
  }, [items]);
  const gerentesUnicos = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.gerente_nome) set.add(i.gerente_nome); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const handleDelete = async (id: string, comprovantes: Comprovante[]) => {
    // remove anexos do storage primeiro
    const paths = comprovantes
      .map((c) => extractStoragePath(c.url))
      .filter((p): p is string => !!p);
    if (paths.length) {
      await supabase.storage.from("financeiro-anexos").remove(paths);
    }
    const { error } = await (supabase as any)
      .from("lancamentos_financeiros")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Lançamento excluído");
      reload();
    }
  };

  if (loading || !(isAdmin || isDiretor)) {
    return <p className="text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10">
      <CyberBackdrop />
      <div className="relative z-10 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-[#39FF14] bg-black/40 backdrop-blur-md">
            // FINANCEIRO
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <LancamentoDialog onDone={reload} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ImportarDialog onDone={reload} />
        <AnexarFaltantesDialog items={items} onDone={reload} />
        <VincularArquivosDialog items={items} onDone={reload} />
      </div>

      <ResumoCards filtered={filtered} />

      <div className="flex flex-wrap items-end gap-3 p-4">
        <div className="grid gap-1">
          <Label>Ano</Label>
          <Select value={filtroAno} onValueChange={setFiltroAno}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {anosUnicos.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>Mês</Label>
          <Select value={filtroMes} onValueChange={setFiltroMes}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {MESES.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>Destino</Label>
          <Select value={filtroDestino} onValueChange={setFiltroDestino}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="diretor">Diretor</SelectItem>
              <SelectItem value="superintendente">Superintendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>Tipo de gasto</Label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="manutencao">Manutenção</SelectItem>
              <SelectItem value="gerar_venda">Gerar Venda</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>Gerente</Label>
          <Select value={filtroGerente} onValueChange={setFiltroGerente}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="__sem__">Sem gerente</SelectItem>
              {gerentesUnicos.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-[#39FF14]/40 bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Gerente</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="whitespace-nowrap">Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Comprovantes</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingList ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum lançamento</TableCell></TableRow>
            ) : filtered.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="whitespace-nowrap">{String(i.mes).padStart(2, "0")}/{i.ano}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="font-medium">{i.destino_nome}</div>
                  <div className="text-xs text-muted-foreground capitalize">{i.destino_tipo}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{i.gerente_nome || "—"}</TableCell>
                <TableCell className="min-w-[260px] whitespace-pre-wrap break-words">{i.descricao || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${i.tipo_gasto === "gerar_venda" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                    {i.tipo_gasto === "gerar_venda" ? "Gerar Venda" : "Manutenção"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap">{brl(Number(i.valor))}</TableCell>
                <TableCell>
                  <AnexosCell comprovantes={i.comprovantes ?? []} />
                </TableCell>
                <TableCell className="flex gap-1 whitespace-nowrap">
                  <LancamentoDialog onDone={reload} lancamento={i} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Os comprovantes também serão removidos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(i.id, i.comprovantes ?? [])}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </div>
    </div>
  );
}

function ResumoCards({ filtered }: { filtered: Lancamento[] }) {
  const total = filtered.reduce((s, i) => s + Number(i.valor || 0), 0);
  const manutencao = filtered
    .filter((i) => i.tipo_gasto === "manutencao")
    .reduce((s, i) => s + Number(i.valor || 0), 0);
  const gerarVenda = filtered
    .filter((i) => i.tipo_gasto === "gerar_venda")
    .reduce((s, i) => s + Number(i.valor || 0), 0);

  // média mensal: divide pelo número de meses distintos com lançamentos no conjunto filtrado
  const mesesDistintos = useMemo(() => {
    const set = new Set(filtered.map((i) => `${i.ano}-${String(i.mes).padStart(2, '0')}`));
    return Math.max(set.size, 1);
  }, [filtered]);
  const mediaMensal = total / mesesDistintos;

  const pctManutencao = total > 0 ? (manutencao / total) * 100 : 0;
  const pctGerarVenda = total > 0 ? (gerarVenda / total) * 100 : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="rounded-lg border border-[#39FF14]/40 bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-[#39FF14]">Total investido</div>
        <div className="text-xl font-bold mt-1">{brl(total)}</div>
      </div>
      <div className="rounded-lg border border-[#39FF14]/40 bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-[#39FF14]">Média mensal</div>
        <div className="text-xl font-bold mt-1">{brl(mediaMensal)}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {mesesDistintos} mes(es) com lançamentos
        </div>
      </div>
      <div className="rounded-lg border border-[#39FF14]/40 bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-[#39FF14]">Manutenção</div>
        <div className="text-xl font-bold mt-1 text-amber-700 dark:text-amber-300">{brl(manutencao)}</div>
        <div className="text-xs text-muted-foreground mt-1">{pctManutencao.toFixed(1)}% do total</div>
      </div>
      <div className="rounded-lg border border-[#39FF14]/40 bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-[#39FF14]">Gerar Venda</div>
        <div className="text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{brl(gerarVenda)}</div>
        <div className="text-xs text-muted-foreground mt-1">{pctGerarVenda.toFixed(1)}% do total</div>
      </div>
    </div>
  );
}

function extractStoragePath(url: string): string | null {
  // signed URL contém .../object/sign/financeiro-anexos/<path>?token=...
  // path armazenado também pode ser apenas o caminho relativo
  const m = url.match(/financeiro-anexos\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function AnexosCell({ comprovantes }: { comprovantes: Comprovante[] }) {
  const [loading, setLoading] = useState(false);
  if (!comprovantes?.length) return <span className="text-muted-foreground">—</span>;

  const abrirTudo = async () => {
    setLoading(true);
    // abre a aba imediatamente para evitar bloqueio de popup
    const tab = window.open("", "_blank");
    try {
      const merged = await PDFDocument.create();
      const font = await merged.embedFont(StandardFonts.Helvetica);
      for (const c of comprovantes) {
        const path = extractStoragePath(c.url);
        if (!path) continue;
        const { data, error } = await supabase.storage
          .from("financeiro-anexos")
          .createSignedUrl(path, 300);
        if (error || !data) continue;
        const resp = await fetch(data.signedUrl);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const mime = (c.mime || "").toLowerCase();
        try {
          if (mime === "application/pdf" || c.nome?.toLowerCase().endsWith(".pdf")) {
            const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((p) => merged.addPage(p));
          } else if (mime.startsWith("image/") || /\.(png|jpe?g)$/i.test(c.nome || "")) {
            const isPng = mime.includes("png") || /\.png$/i.test(c.nome || "");
            const img = isPng ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
            const maxW = 595, maxH = 842; // A4 pt
            const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
            const w = img.width * ratio;
            const h = img.height * ratio;
            const page = merged.addPage([maxW, maxH]);
            page.drawImage(img, { x: (maxW - w) / 2, y: (maxH - h) / 2, width: w, height: h });
          } else {
            const page = merged.addPage([595, 842]);
            page.drawText(`Arquivo não suportado para mesclagem: ${c.nome}`, {
              x: 40, y: 800, size: 12, font,
            });
          }
        } catch {
          const page = merged.addPage([595, 842]);
          page.drawText(`Falha ao incluir: ${c.nome}`, { x: 40, y: 800, size: 12, font });
        }
      }
      if (merged.getPageCount() === 0) {
        toast.error("Nenhum comprovante pôde ser aberto");
        tab?.close();
        return;
      }
      const out = await merged.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao montar PDF");
      tab?.close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 whitespace-nowrap"
      onClick={abrirTudo}
      disabled={loading}
    >
      <FileText className="h-3 w-3" />
      Comprovantes
      <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">{comprovantes.length}</span>
    </Button>
  );
}

// =================== Anexar comprovantes faltantes ===================

function AnexarFaltantesDialog({ items, onDone }: { items: Lancamento[]; onDone: () => void }) {
  const faltantes = useMemo(
    () => items.filter((i) => !i.comprovantes || i.comprovantes.length === 0),
    [items]
  );
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const atual = faltantes[idx];

  const reset = () => {
    setIdx(0);
    setFiles([]);
  };

  const proximo = () => {
    setFiles([]);
    if (idx + 1 >= faltantes.length) {
      setOpen(false);
      reset();
      onDone();
    } else {
      setIdx(idx + 1);
    }
  };

  const salvar = async () => {
    if (!atual) return;
    if (files.length === 0) { toast.error("Anexe pelo menos um comprovante"); return; }
    setSaving(true);
    try {
      const uploaded: Comprovante[] = [];
      for (const f of files) {
        const path = `${atual.ano}/${String(atual.mes).padStart(2, "0")}/${crypto.randomUUID()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("financeiro-anexos")
          .upload(path, f, { upsert: false, contentType: f.type });
        if (upErr) throw new Error("Falha ao enviar " + f.name + ": " + upErr.message);
        uploaded.push({ url: `financeiro-anexos/${path}`, nome: f.name, mime: f.type });
      }
      const novos = [...(atual.comprovantes ?? []), ...uploaded];
      const { error } = await (supabase as any)
        .from("lancamentos_financeiros")
        .update({ comprovantes: novos })
        .eq("id", atual.id);
      if (error) throw error;
      toast.success("Comprovante anexado");
      proximo();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Paperclip className="h-4 w-4 mr-1" />
          Anexar faltantes
          {faltantes.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {faltantes.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Anexar comprovantes faltantes
            {faltantes.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({idx + 1} de {faltantes.length})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {!atual ? (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum lançamento sem comprovante 🎉
          </p>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Período:</span> <strong>{String(atual.mes).padStart(2, "0")}/{atual.ano}</strong></div>
              <div><span className="text-muted-foreground">Destino:</span> <strong>{atual.destino_nome}</strong> <span className="text-xs capitalize text-muted-foreground">({atual.destino_tipo})</span></div>
              {atual.gerente_nome && <div><span className="text-muted-foreground">Gerente:</span> <strong>{atual.gerente_nome}</strong></div>}
              <div><span className="text-muted-foreground">Tipo:</span> <strong>{atual.tipo_gasto === "gerar_venda" ? "Gerar Venda" : "Manutenção"}</strong></div>
              <div><span className="text-muted-foreground">Valor:</span> <strong>{brl(Number(atual.valor))}</strong></div>
              {atual.descricao && <div><span className="text-muted-foreground">Descrição:</span> {atual.descricao}</div>}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => setFiles((prev) => [...prev, ...(Array.from(e.target.files ?? []))])}
            />
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer
                ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
                const dropped = Array.from(e.dataTransfer.files ?? []).filter(
                  (f) => f.type === "application/pdf" || f.type.startsWith("image/")
                );
                if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pastedFiles: File[] = [];
                if (e.clipboardData?.files) {
                  for (let i = 0; i < e.clipboardData.files.length; i++) {
                    const f = e.clipboardData.files[i];
                    if (f.type === "application/pdf" || f.type.startsWith("image/")) pastedFiles.push(f);
                  }
                }
                if (pastedFiles.length) {
                  setFiles((prev) => [...prev, ...pastedFiles]);
                  toast.success(`${pastedFiles.length} arquivo(s) colado(s)`);
                }
              }}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {dragOver ? "Solte os arquivos aqui" : "Arraste, clique ou cole (Ctrl+V) os comprovantes"}
              </p>
              <p className="text-xs text-muted-foreground">PDF ou imagem, máx. 20MB</p>
            </div>
            {files.length > 0 && (
              <ul className="text-xs text-muted-foreground">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="truncate">• {f.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 -ml-1" onClick={() => setFiles((prev) => prev.filter((_, ix) => ix !== i))} title="Remover">
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Fechar</Button>
          {atual && (
            <>
              <Button variant="ghost" onClick={proximo} disabled={saving}>Pular</Button>
              <Button onClick={salvar} disabled={saving || files.length === 0}>
                {saving ? "Salvando…" : (idx + 1 < faltantes.length ? "Salvar e próximo" : "Salvar e finalizar")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== Vincular arquivos do WhatsApp ===================

type FileEntry = {
  id: string;
  file: File;
  status: "pendente" | "vinculado" | "pulado";
  vinculadoEm?: string; // lancamento id
  previewUrl: string;
};

function fmtFileDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const PROGRESS_KEY = "vincular-arquivos-progress-v1";
const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
type ProgressMap = Record<string, { status: "vinculado" | "pulado"; vinculadoEm?: string; vinculadoNome?: string }>;

function loadProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); } catch { return {}; }
}
function saveProgress(p: ProgressMap) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}

function VincularArquivosDialog({ items, onDone }: { items: Lancamento[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [busca, setBusca] = useState("");
  const [somentePendentes, setSomentePendentes] = useState(true);
  const [filtroMesArquivo, setFiltroMesArquivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const atual = entries[idx];

  const addFiles = (list: File[]) => {
    const prog = loadProgress();
    const novos: FileEntry[] = list
      .filter((f) => f.type === "application/pdf" || f.type.startsWith("image/"))
      .map((f) => {
        const saved = prog[fileKey(f)];
        return {
          id: crypto.randomUUID(),
          file: f,
          status: saved?.status ?? "pendente",
          vinculadoEm: saved?.vinculadoEm,
          previewUrl: URL.createObjectURL(f),
        };
      });
    if (novos.length) {
      // ordena por data de modificação (mais antigo primeiro — segue a ordem da conversa)
      novos.sort((a, b) => a.file.lastModified - b.file.lastModified);
      setEntries((prev) => {
        const existing = new Set(prev.map((e) => fileKey(e.file)));
        const filtered = novos.filter((n) => !existing.has(fileKey(n.file)));
        const all = [...prev, ...filtered];
        // posiciona no primeiro pendente
        const firstPend = all.findIndex((e) => e.status === "pendente");
        if (firstPend >= 0) setIdx(firstPend);
        return all;
      });
      const restaurados = novos.filter((n) => n.status !== "pendente").length;
      if (restaurados) toast.success(`${restaurados} arquivo(s) com progresso restaurado`);
    }
  };

  const limparTudo = () => {
    if (!confirm("Limpar todos os arquivos e o progresso salvo?")) return;
    entries.forEach((e) => URL.revokeObjectURL(e.previewUrl));
    setEntries([]);
    setIdx(0);
    setBusca("");
    try { localStorage.removeItem(PROGRESS_KEY); } catch {}
  };

  useEffect(() => {
    return () => { entries.forEach((e) => URL.revokeObjectURL(e.previewUrl)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const candidatos = useMemo(() => {
    let list = items;
    if (somentePendentes) {
      list = list.filter((i) => !i.comprovantes || i.comprovantes.length === 0);
    }
    if (filtroMesArquivo && atual) {
      const d = new Date(atual.file.lastModified);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      list = list.filter((i) => i.mes === m && i.ano === y);
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        (i.destino_nome || "").toLowerCase().includes(q) ||
        (i.gerente_nome || "").toLowerCase().includes(q) ||
        (i.descricao || "").toLowerCase().includes(q) ||
        String(i.valor).includes(q)
      );
    }
    return list.slice(0, 200);
  }, [items, somentePendentes, filtroMesArquivo, atual, busca]);

  const irPara = (i: number) => {
    if (i < 0 || i >= entries.length) return;
    setIdx(i);
    setBusca("");
  };

  const proximoPendente = (fromIdx: number) => {
    for (let i = fromIdx + 1; i < entries.length; i++) {
      if (entries[i].status === "pendente") return i;
    }
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].status === "pendente") return i;
    }
    return Math.min(fromIdx + 1, entries.length - 1);
  };

  const pular = () => {
    if (!atual) return;
    const k = fileKey(atual.file);
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, status: "pulado" } : e));
    const prog = loadProgress();
    prog[k] = { status: "pulado" };
    saveProgress(prog);
    irPara(proximoPendente(idx));
  };

  const vincular = async (lanc: Lancamento) => {
    if (!atual) return;
    setSaving(true);
    try {
      const f = atual.file;
      const path = `${lanc.ano}/${String(lanc.mes).padStart(2, "0")}/${crypto.randomUUID()}-${f.name}`;
      const { error: upErr } = await supabase.storage
        .from("financeiro-anexos")
        .upload(path, f, { upsert: false, contentType: f.type });
      if (upErr) throw new Error("Falha ao enviar: " + upErr.message);
      const novo: Comprovante = { url: `financeiro-anexos/${path}`, nome: f.name, mime: f.type };
      const novos = [...(lanc.comprovantes ?? []), novo];
      const { error } = await (supabase as any)
        .from("lancamentos_financeiros")
        .update({ comprovantes: novos })
        .eq("id", lanc.id);
      if (error) throw error;
      toast.success(`Vinculado a ${lanc.destino_nome}`);
      setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, status: "vinculado", vinculadoEm: lanc.id } : e));
      const prog = loadProgress();
      prog[fileKey(atual.file)] = { status: "vinculado", vinculadoEm: lanc.id, vinculadoNome: lanc.destino_nome };
      saveProgress(prog);
      onDone();
      const next = proximoPendente(idx);
      irPara(next);
    } catch (e: any) {
      toast.error(e.message || "Erro ao vincular");
    } finally {
      setSaving(false);
    }
  };

  const pendentesCount = entries.filter((e) => e.status === "pendente").length;
  const vinculadosCount = entries.filter((e) => e.status === "vinculado").length;
  const progressoSalvo = useMemo(() => Object.keys(loadProgress()).length, [open, entries]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="h-4 w-4 mr-1" />
          Vincular arquivos
          {progressoSalvo > 0 && entries.length === 0 && (
            <span className="ml-1 text-[10px] text-muted-foreground">({progressoSalvo} salvos)</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-3">
            Vincular comprovantes aos lançamentos
            {entries.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                {idx + 1} de {entries.length} • {vinculadosCount} vinculados • {pendentesCount} pendentes
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {entries.length === 0 ? (
          <div className="p-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-12 text-center transition-colors cursor-pointer
                ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files ?? [])); }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Selecione todos os arquivos do WhatsApp</p>
              <p className="text-xs text-muted-foreground">PDF ou imagem. Eles serão ordenados pela data de modificação.</p>
              {progressoSalvo > 0 && (
                <p className="text-xs text-emerald-600 mt-2">
                  Você tem {progressoSalvo} arquivo(s) com progresso salvo. Reenvie os mesmos arquivos para continuar de onde parou.
                </p>
              )}
            </div>
            {progressoSalvo > 0 && (
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => { if (confirm("Apagar progresso salvo?")) { try { localStorage.removeItem(PROGRESS_KEY); } catch {} ; toast.success("Progresso limpo"); } }}>
                  Limpar progresso salvo
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[260px_1fr_380px] h-[78vh]">
            {/* Lista de arquivos */}
            <div className="border-r overflow-y-auto">
              <div className="p-2 border-b sticky top-0 bg-background z-10">
                <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar mais
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                />
              </div>
              <ul className="text-xs">
                {entries.map((e, i) => (
                  <li key={e.id}>
                    <button
                      className={`w-full text-left px-3 py-2 border-b hover:bg-muted/50 ${i === idx ? "bg-primary/10" : ""}`}
                      onClick={() => irPara(i)}
                    >
                      <div className="flex items-center gap-1">
                        {e.status === "vinculado" ? <Check className="h-3 w-3 text-emerald-600 shrink-0" /> :
                         e.status === "pulado" ? <SkipForward className="h-3 w-3 text-muted-foreground shrink-0" /> :
                         <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />}
                        <span className="truncate font-medium">{e.file.name}</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 ml-4">{fmtFileDate(e.file.lastModified)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Preview */}
            <div className="flex flex-col overflow-hidden bg-muted/20">
              {atual && (
                <>
                  <div className="px-4 py-2 border-b bg-background flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{atual.file.name}</div>
                      <div className="text-xs text-muted-foreground">Modificado em {fmtFileDate(atual.file.lastModified)}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => irPara(idx - 1)} disabled={idx === 0} title="Anterior">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => irPara(idx + 1)} disabled={idx >= entries.length - 1} title="Próximo">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {atual.file.type.startsWith("image/") ? (
                      <div className="h-full w-full flex items-center justify-center overflow-auto p-2">
                        <img src={atual.previewUrl} alt={atual.file.name} className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <iframe src={atual.previewUrl} title={atual.file.name} className="w-full h-full border-0" />
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Painel de vincular */}
            <div className="border-l flex flex-col overflow-hidden">
              <div className="p-3 border-b space-y-2">
                <Input
                  placeholder="Buscar destino, gerente, descrição, valor…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={somentePendentes} onChange={(e) => setSomentePendentes(e.target.checked)} />
                    Sem comprovante
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={filtroMesArquivo} onChange={(e) => setFiltroMesArquivo(e.target.checked)} />
                    Mês do arquivo
                  </label>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {candidatos.length === 0 ? (
                  <p className="p-4 text-sm text-center text-muted-foreground">Nenhum lançamento encontrado. Ajuste os filtros.</p>
                ) : (
                  <ul className="divide-y">
                    {candidatos.map((l) => (
                      <li key={l.id} className="p-3 hover:bg-muted/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{l.destino_nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {String(l.mes).padStart(2, "0")}/{l.ano} • {l.tipo_gasto === "gerar_venda" ? "Gerar Venda" : "Manutenção"}
                              {l.gerente_nome ? ` • ${l.gerente_nome}` : ""}
                            </div>
                            {l.descricao && <div className="text-xs text-muted-foreground truncate mt-0.5">{l.descricao}</div>}
                            <div className="text-sm font-semibold mt-1">{brl(Number(l.valor))}</div>
                            {l.comprovantes?.length > 0 && (
                              <div className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                                já tem {l.comprovantes.length} anexo(s)
                              </div>
                            )}
                          </div>
                          <Button size="sm" onClick={() => vincular(l)} disabled={saving}>
                            <Link2 className="h-3 w-3 mr-1" /> Vincular
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-3 border-t flex gap-2">
                <Button variant="outline" className="flex-1" onClick={pular} disabled={saving || !atual}>
                  <SkipForward className="h-3 w-3 mr-1" /> Pular este
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-3 border-t">
          {entries.length > 0 && (
            <Button variant="ghost" onClick={limparTudo}>Limpar tudo</Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar (progresso salvo)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== Novo Lançamento ===================

function LancamentoDialog({ onDone, lancamento }: { onDone: () => void; lancamento?: Lancamento }) {
  const isEdit = !!lancamento;
  const [open, setOpen] = useState(false);
  const { diretores, superintendentes, gerentesBySupNome } = useHierarquia();
  const hoje = new Date();
  const [mes, setMes] = useState<string>(String(lancamento?.mes ?? hoje.getMonth() + 1));
  const [ano, setAno] = useState<string>(String(lancamento?.ano ?? hoje.getFullYear()));
  const [destinoTipo, setDestinoTipo] = useState<DestinoTipo>(lancamento?.destino_tipo ?? "diretor");
  const [destinoId, setDestinoId] = useState<string>(lancamento?.destino_id ?? "");
  const [destinoNomeManual, setDestinoNomeManual] = useState<string>(lancamento && !lancamento.destino_id ? lancamento.destino_nome : "");
  const [gerenteId, setGerenteId] = useState<string>(lancamento?.gerente_id ?? "__none");
  const [gerenteNomeManual, setGerenteNomeManual] = useState<string>(lancamento && !lancamento.gerente_id && lancamento.gerente_nome ? lancamento.gerente_nome : "");
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? "");
  const [valor, setValor] = useState<string>(lancamento ? String(lancamento.valor).replace(".", ",") : "");
  const [tipoGasto, setTipoGasto] = useState<TipoGasto>(lancamento?.tipo_gasto ?? "manutencao");
  const [files, setFiles] = useState<File[]>([]);
  const [comprovantesExistentes, setComprovantesExistentes] = useState<Comprovante[]>(lancamento?.comprovantes ?? []);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    if (isEdit && lancamento) {
      setMes(String(lancamento.mes));
      setAno(String(lancamento.ano));
      setDestinoTipo(lancamento.destino_tipo);
      setDestinoId(lancamento.destino_id ?? "");
      setDestinoNomeManual(!lancamento.destino_id ? lancamento.destino_nome : "");
      setGerenteId(lancamento.gerente_id ?? "__none");
      setGerenteNomeManual(!lancamento.gerente_id && lancamento.gerente_nome ? lancamento.gerente_nome : "");
      setDescricao(lancamento.descricao ?? "");
      setValor(String(lancamento.valor).replace(".", ","));
      setTipoGasto(lancamento.tipo_gasto);
      setComprovantesExistentes(lancamento.comprovantes ?? []);
    } else {
      setMes(String(hoje.getMonth() + 1));
      setAno(String(hoje.getFullYear()));
      setDestinoTipo("diretor");
      setDestinoId("");
      setDestinoNomeManual("");
      setGerenteId("__none");
      setGerenteNomeManual("");
      setDescricao("");
      setValor("");
      setTipoGasto("manutencao");
      setComprovantesExistentes([]);
    }
    setFiles([]);
  };

  const destinos = destinoTipo === "diretor" ? diretores : superintendentes;
  const destinoSelecionado = destinos.find((d) => d.id === destinoId);

  // gerentes disponíveis: se sup, filtrar pelo sup; se diretor, todos
  const gerentesList = useMemo(() => {
    if (destinoTipo === "superintendente" && destinoSelecionado) {
      return gerentesBySupNome(destinoSelecionado.nome);
    }
    return gerentesBySupNome("todos");
  }, [destinoTipo, destinoSelecionado, gerentesBySupNome]);

  const submit = async () => {
    const destinoNomeFinal = destinos.find((d) => d.id === destinoId)?.nome
      ?? (destinoNomeManual.trim() || (isEdit ? lancamento!.destino_nome : ""));
    if (!destinoId && !destinoNomeFinal) { toast.error("Selecione o destino"); return; }
    const valorNum = Number(valor.replace(",", "."));
    if (!valorNum || valorNum <= 0) { toast.error("Informe um valor válido"); return; }
    setSaving(true);
    try {
      // upload comprovantes
      const uploaded: Comprovante[] = [];
      for (const f of files) {
        const path = `${ano}/${String(mes).padStart(2, "0")}/${crypto.randomUUID()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("financeiro-anexos")
          .upload(path, f, { upsert: false, contentType: f.type });
        if (upErr) throw new Error("Falha ao enviar " + f.name + ": " + upErr.message);
        uploaded.push({ url: `financeiro-anexos/${path}`, nome: f.name, mime: f.type });
      }
      const gerenteNome = gerenteId !== "__none"
        ? gerentesList.find((g) => g.id === gerenteId)?.nome ?? null
        : (gerenteNomeManual.trim() || null);
      const payload = {
        mes: Number(mes),
        ano: Number(ano),
        destino_tipo: destinoTipo,
        destino_id: destinoId || null,
        destino_nome: destinoNomeFinal || "—",
        gerente_id: gerenteId !== "__none" ? gerenteId : null,
        gerente_nome: gerenteNome,
        descricao: descricao || null,
        valor: valorNum,
        tipo_gasto: tipoGasto,
        comprovantes: [...comprovantesExistentes, ...uploaded],
      };
      if (isEdit) {
        const { error } = await (supabase as any)
          .from("lancamentos_financeiros")
          .update(payload)
          .eq("id", lancamento!.id);
        if (error) throw error;
        toast.success("Lançamento atualizado");
      } else {
        const { error } = await (supabase as any)
          .from("lancamentos_financeiros")
          .insert(payload);
        if (error) throw error;
        toast.success("Lançamento criado");
      }
      reset();
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() - 3 + i);

  const removerAnexoExistente = async (c: Comprovante) => {
    const path = extractStoragePath(c.url);
    if (path) {
      await supabase.storage.from("financeiro-anexos").remove([path]);
    }
    setComprovantesExistentes((prev) => prev.filter((x) => x.url !== c.url));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {isEdit
          ? <Button variant="ghost" size="icon" title="Editar"><Pencil className="h-4 w-4" /></Button>
          : <Button><Plus className="h-4 w-4 mr-1" />Novo lançamento</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar lançamento" : "Novo lançamento financeiro"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Mês</Label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Ano</Label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Destino</Label>
            <div className="flex gap-2">
              <Button type="button" variant={destinoTipo === "diretor" ? "default" : "outline"} size="sm" onClick={() => { setDestinoTipo("diretor"); setDestinoId(""); }}>Diretor</Button>
              <Button type="button" variant={destinoTipo === "superintendente" ? "default" : "outline"} size="sm" onClick={() => { setDestinoTipo("superintendente"); setDestinoId(""); }}>Superintendente</Button>
            </div>
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={`Selecione ${destinoTipo === "diretor" ? "o diretor" : "o superintendente"}`} /></SelectTrigger>
              <SelectContent>
                {destinos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {isEdit && !destinoId && (
              <Input
                className="mt-1"
                placeholder="Nome do destino (importado)"
                value={destinoNomeManual}
                onChange={(e) => setDestinoNomeManual(e.target.value)}
              />
            )}
          </div>

          <div className="grid gap-1">
            <Label>Gerente (opcional)</Label>
            <Select value={gerenteId} onValueChange={setGerenteId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Nenhum —</SelectItem>
                {gerentesList.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {isEdit && gerenteId === "__none" && (
              <Input
                className="mt-1"
                placeholder="Nome do gerente (importado, opcional)"
                value={gerenteNomeManual}
                onChange={(e) => setGerenteNomeManual(e.target.value)}
              />
            )}
          </div>

          <div className="grid gap-1">
            <Label>Descrição (opcional)</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Valor (R$)</Label>
              <Input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="grid gap-1">
              <Label>Tipo de gasto</Label>
              <div className="flex gap-2">
                <Button type="button" className="flex-1" variant={tipoGasto === "manutencao" ? "default" : "outline"} onClick={() => setTipoGasto("manutencao")}>Manutenção</Button>
                <Button type="button" className="flex-1" variant={tipoGasto === "gerar_venda" ? "default" : "outline"} onClick={() => setTipoGasto("gerar_venda")}>Gerar Venda</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Comprovantes (PDF ou imagem)</Label>
            {comprovantesExistentes.length > 0 && (
              <ul className="mb-1 space-y-1 text-xs">
                {comprovantesExistentes.map((c, idx) => (
                  <li key={idx} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1">
                    <span className="truncate">{c.nome}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removerAnexoExistente(c)} title="Remover anexo">
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => setFiles((prev) => [...prev, ...(Array.from(e.target.files ?? []))])}
            />
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer
                ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
                const dropped = Array.from(e.dataTransfer.files ?? []).filter(
                  (f) => f.type === "application/pdf" || f.type.startsWith("image/")
                );
                if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pastedFiles: File[] = [];
                if (e.clipboardData?.files) {
                  for (let i = 0; i < e.clipboardData.files.length; i++) {
                    const f = e.clipboardData.files[i];
                    if (f.type === "application/pdf" || f.type.startsWith("image/")) {
                      pastedFiles.push(f);
                    }
                  }
                }
                if (e.clipboardData?.items) {
                  for (let i = 0; i < e.clipboardData.items.length; i++) {
                    const item = e.clipboardData.items[i];
                    if (item.kind === "file") {
                      const f = item.getAsFile();
                      if (f && (f.type === "application/pdf" || f.type.startsWith("image/"))) {
                        pastedFiles.push(f);
                      }
                    }
                  }
                }
                if (pastedFiles.length) {
                  setFiles((prev) => [...prev, ...pastedFiles]);
                  toast.success(`${pastedFiles.length} arquivo(s) colado(s)`);
                }
              }}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {dragOver ? "Solte os arquivos aqui" : "Arraste, clique ou cole (Ctrl+V) os comprovantes"}
              </p>
              <p className="text-xs text-muted-foreground">PDF ou imagem, máx. 20MB</p>
            </div>
            {files.length > 0 && (
              <ul className="mt-1 text-xs text-muted-foreground">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="truncate">• {f.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 -ml-1" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} title="Remover">
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== Importar Excel ===================

type CampoSistema =
  | "mes"
  | "ano"
  | "destino_tipo"
  | "destino_nome"
  | "gerente_nome"
  | "descricao"
  | "valor"
  | "tipo_gasto";

const CAMPOS: { key: CampoSistema; label: string; required: boolean }[] = [
  { key: "mes", label: "Mês (1-12)", required: true },
  { key: "ano", label: "Ano", required: true },
  { key: "destino_tipo", label: "Tipo destino (diretor/superintendente)", required: true },
  { key: "destino_nome", label: "Nome do destino", required: true },
  { key: "gerente_nome", label: "Gerente", required: false },
  { key: "descricao", label: "Descrição", required: false },
  { key: "valor", label: "Valor", required: true },
  { key: "tipo_gasto", label: "Tipo de gasto (manutencao/gerar_venda)", required: true },
];

function ImportarDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<CampoSistema, string>>({} as any);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setRows([]);
    setHeaders([]);
    setMapping({} as any);
  };

  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });
      if (!json.length) {
        toast.error("Planilha vazia");
        return;
      }
      const hdrs = Object.keys(json[0]);
      setRows(json);
      setHeaders(hdrs);
      // auto-map por similaridade
      const guess: Record<CampoSistema, string> = {} as any;
      for (const c of CAMPOS) {
        const match = hdrs.find((h) => normalize(h) === normalize(c.label) || normalize(h).includes(normalize(c.key)));
        if (match) guess[c.key] = match;
      }
      setMapping(guess);
    } catch (e: any) {
      toast.error("Erro ao ler arquivo: " + e.message);
    }
  };

  const camposFaltando = CAMPOS.filter((c) => c.required && !mapping[c.key]);

  const doImport = async () => {
    if (camposFaltando.length) {
      toast.error("Mapeie todas as colunas obrigatórias");
      return;
    }
    setImporting(true);
    let okCount = 0;
    const errs: string[] = [];
    const parseMesAno = (rawMes: any, rawAno: any): { mes: number; ano: number } => {
      // Caso 1: célula veio como Date (cellDates: true)
      if (rawMes instanceof Date && !isNaN(rawMes.getTime())) {
        return { mes: rawMes.getMonth() + 1, ano: Number(rawAno) || rawMes.getFullYear() };
      }
      // Caso 2: número serial do Excel (>12 indica data, não mês)
      const n = Number(rawMes);
      if (Number.isFinite(n) && n > 12) {
        // Excel serial: dias desde 1899-12-30
        const d = new Date(Math.round((n - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          return { mes: d.getUTCMonth() + 1, ano: Number(rawAno) || d.getUTCFullYear() };
        }
      }
      // Caso 3: string tipo "01/2026", "jan/2026", "janeiro", "1"
      const s = String(rawMes ?? "").trim().toLowerCase();
      const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
      const idx = meses.findIndex((m) => s.startsWith(m));
      if (idx >= 0) return { mes: idx + 1, ano: Number(rawAno) || 0 };
      const m = s.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
      if (m) return { mes: Number(m[1]), ano: Number(m[2].length === 2 ? "20" + m[2] : m[2]) };
      return { mes: Number(rawMes) || 0, ano: Number(rawAno) || 0 };
    };
    const payload = rows.map((r, idx) => {
      try {
        const tipoDestRaw = String(r[mapping.destino_tipo] ?? "").toLowerCase().trim();
        const tipoDestino: DestinoTipo = tipoDestRaw.startsWith("sup") ? "superintendente" : "diretor";
        const tipoGastoRaw = String(r[mapping.tipo_gasto] ?? "").toLowerCase().trim();
        const tipoGasto: TipoGasto =
          tipoGastoRaw.includes("gerar") || tipoGastoRaw.includes("venda") ? "gerar_venda" : "manutencao";
        const valorRaw = String(r[mapping.valor] ?? "0").replace(/[^\d,.-]/g, "").replace(",", ".");
        const { mes, ano } = parseMesAno(r[mapping.mes], r[mapping.ano]);
        return {
          mes,
          ano,
          destino_tipo: tipoDestino,
          destino_nome: String(r[mapping.destino_nome] ?? "").trim() || "—",
          gerente_nome: mapping.gerente_nome ? (String(r[mapping.gerente_nome] ?? "").trim() || null) : null,
          descricao: mapping.descricao ? (String(r[mapping.descricao] ?? "").trim() || null) : null,
          valor: Number(valorRaw) || 0,
          tipo_gasto: tipoGasto,
          comprovantes: [],
        };
      } catch (e: any) {
        errs.push(`Linha ${idx + 2}: ${e.message}`);
        return null;
      }
    }).filter(Boolean);

    // valida cada linha
    const validPayload = payload.filter((p: any) => {
      const ok = p.mes >= 1 && p.mes <= 12 && p.ano >= 2000 && p.ano <= 2100 && p.valor >= 0;
      if (!ok) errs.push(`Linha com dados inválidos descartada: ${JSON.stringify(p)}`);
      return ok;
    });

    // insere em lote (até 500 por chamada)
    const chunkSize = 500;
    for (let i = 0; i < validPayload.length; i += chunkSize) {
      const chunk = validPayload.slice(i, i + chunkSize);
      const { error } = await (supabase as any)
        .from("lancamentos_financeiros")
        .insert(chunk);
      if (error) {
        errs.push(`Lote ${i / chunkSize + 1}: ${error.message}`);
      } else {
        okCount += chunk.length;
      }
    }

    setImporting(false);
    if (okCount) toast.success(`${okCount} lançamento(s) importado(s)`);
    if (errs.length) toast.error(`${errs.length} erro(s). Verifique o console.`);
    if (errs.length) console.warn("Erros importação:", errs);
    if (okCount) {
      reset();
      setOpen(false);
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4 mr-1" />Importar Excel</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar lançamentos do Excel</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Selecione um arquivo .xlsx com os lançamentos. Após o upload, você poderá conferir e ajustar o mapeamento das colunas.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Colunas esperadas:</p>
              <ul className="grid grid-cols-2 gap-x-4">
                {CAMPOS.map((c) => (
                  <li key={c.key}>• {c.label}{c.required && <span className="text-destructive"> *</span>}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <h3 className="text-sm font-medium mb-2">Mapeamento de colunas</h3>
              <div className="grid gap-2">
                {CAMPOS.map((c) => (
                  <div key={c.key} className="grid grid-cols-[1fr_2fr] items-center gap-2">
                    <Label className="text-sm">
                      {c.label}
                      {c.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={mapping[c.key] ?? "__none"}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [c.key]: v === "__none" ? "" : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="— Não mapear —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— Não mapear —</SelectItem>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {camposFaltando.length > 0 && (
                <p className="mt-2 text-xs text-destructive">
                  Mapeie: {camposFaltando.map((c) => c.label).join(", ")}
                </p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Pré-visualização ({Math.min(5, rows.length)} de {rows.length} linhas)</h3>
              <div className="rounded-md border overflow-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {CAMPOS.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        {CAMPOS.map((c) => (
                          <TableCell key={c.key} className="text-xs">
                            {mapping[c.key] ? String(r[mapping[c.key]] ?? "") : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={importing}>Cancelar</Button>
          {rows.length > 0 && (
            <Button onClick={doImport} disabled={importing || camposFaltando.length > 0}>
              {importing ? "Importando…" : `Importar ${rows.length} linha(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}