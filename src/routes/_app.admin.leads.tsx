import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Upload, Trash2, Check, PlusCircle, RefreshCw, Sparkles, ArrowLeft } from "lucide-react";
import * as XLSX from "xlsx";
import {
  leadsList,
  leadsBulkImport,
  leadsImportBatchesList,
  leadsImportBatchDelete,
  produtosList,
  leadsConfirmBulk,
  leadsCriarProdutoBulk,
  hierarquiaAliasesList,
  hierarquiaAliasUpsert,
  hierarquiaAliasDelete,
  leadsAliasMover,
} from "@/functions/leads.functions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { CyberHeading } from "@/components/cyber/CyberHeading";

export const Route = createFileRoute("/_app/admin/leads")({ component: LeadsPage });

type Lead = {
  id: string;
  nome_original: string;
  nome_normalizado: string;
  produto_id: string | null;
  produto_sugerido_id: string | null;
  score: number;
  status: string;
  created_at: string;
  gerente: string | null;
  superintendente: string | null;
  fonte: string | null;
  canal: string | null;
  responsavel: string | null;
  contagem: number | null;
};

type Produto = { id: string; nome: string; ativo?: boolean };
type Batch = { id: string; created_at: string; arquivo_nome: string | null; total: number; auto: number; pendente: number; indefinido: number; erros: number };

// ===== Helpers =====
function normalizeKey(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Map flexible header names -> canonical field
const HEADER_MAP: Record<string, string> = {
  superintendente: "superintendente", super: "superintendente",
  gerente: "gerente",
  fonte: "fonte", origem: "fonte",
  canal: "canal",
  usuario: "responsavel", user: "responsavel", responsavel: "responsavel",
  criadoem: "created_at", datacriacao: "created_at", data: "created_at", criado: "created_at",
  titulodolead: "nome", tituloleads: "nome", titulo: "nome", lead: "nome", nome: "nome", nomelead: "nome", nomedolead: "nome",
  contagem: "contagem", qtd: "contagem", quantidade: "contagem",
};

function detectColumn(header: string): string | null {
  const k = normalizeKey(header);
  return HEADER_MAP[k] ?? null;
}

// Parse "dd/mm/aaaa h:mm:ss" or Excel serial, return ISO date string (date-only at noon UTC for stable display)
function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  const s = String(v).trim();
  // dd/mm/yyyy optionally followed by hh:mm or hh:mm:ss
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10) - 1;
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(yr, mon, day, hh, mm, ss);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pendente: { label: "Pendente", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    aprovado_auto: { label: "Auto", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    aprovado_manual: { label: "Manual", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
    indefinido: { label: "Indefinido", cls: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  };
  const m = map[s] ?? { label: s, cls: "" };
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

function LeadsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    if (!token) return;
    setLoading(true);
    try {
      const [{ leads: ls, produtos: ps }, bs] = await Promise.all([
        leadsList({ data: { token, status: "todos" } }) as Promise<{ leads: Lead[]; produtos: Produto[] }>,
        leadsImportBatchesList({ data: { token } }) as Promise<Batch[]>,
      ]);
      setLeads(ls);
      setProdutos(ps);
      setBatches(bs);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [token]);

  return (
    <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10">
      <CyberBackdrop />
      <div className="relative z-10 space-y-6">
      <CyberHeading
        kicker="C2S"
        title="C2S"
        subtitle="Importação, validação e aprendizado de produtos"
        right={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/painel"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="importar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="importar">Importar</TabsTrigger>
          <TabsTrigger value="validar">Validação ({leads.filter(l => l.status === "pendente" || l.status === "indefinido").length})</TabsTrigger>
          <TabsTrigger value="batches">Importações ({batches.length})</TabsTrigger>
          <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
          <TabsTrigger value="produtos">Produtos & Aliases</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <ResumoTab leads={leads} produtos={produtos} />
        </TabsContent>

        <TabsContent value="importar">
          <ImportarTab token={token} onDone={reload} />
        </TabsContent>

        <TabsContent value="validar">
          <ValidarTab token={token} leads={leads} produtos={produtos} onDone={reload} />
        </TabsContent>

        <TabsContent value="batches">
          <BatchesTab token={token} batches={batches} onDone={reload} />
        </TabsContent>

        <TabsContent value="vinculos">
          <VinculosTab token={token} />
        </TabsContent>

        <TabsContent value="produtos">
          <ProdutosTab token={token} onDone={reload} />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

// ============ IMPORTAR ============
function ImportarTab({ token, onDone }: { token: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, any>[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // header -> field
  const [importing, setImporting] = useState(false);

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
          const f = detectColumn(h);
          if (f) auto[h] = f;
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

  const fieldOptions = [
    { value: "__none__", label: "— ignorar —" },
    { value: "nome", label: "Título do lead *" },
    { value: "superintendente", label: "Superintendente" },
    { value: "gerente", label: "Gerente" },
    { value: "fonte", label: "Fonte" },
    { value: "canal", label: "Canal" },
    { value: "responsavel", label: "Usuário" },
    { value: "created_at", label: "Criado em" },
    { value: "contagem", label: "Contagem" },
  ];

  async function doImport() {
    if (!preview) return;
    const nomeHeader = Object.entries(mapping).find(([, f]) => f === "nome")?.[0];
    if (!nomeHeader) { toast.error("Selecione a coluna do título do lead"); return; }
    setImporting(true);
    try {
      const rows = preview.map((r) => {
        const row: any = { contagem: 1 };
        for (const [h, f] of Object.entries(mapping)) {
          if (!f || f === "__none__") continue;
          const v = r[h];
          if (f === "created_at") {
            const iso = parseDate(v);
            if (iso) row[f] = iso;
          } else if (f === "contagem") {
            const n = Number(v);
            row[f] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
          } else if (v != null) {
            row[f] = String(v).trim() || null;
          }
        }
        return row;
      }).filter((r) => r.nome && String(r.nome).trim().length);

      if (!rows.length) { toast.error("Nenhuma linha válida"); return; }

      // chunk to avoid huge payloads / timeouts no servidor
      const CHUNK = 200;
      let batch_id: string | null = null;
      let totals = { auto: 0, pendente: 0, indef: 0, erros: 0, total: 0 };
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const res = await leadsBulkImport({
          data: { token, rows: slice, arquivo_nome: fileName || null, batch_id },
        }) as any;
        batch_id = res.batch_id;
        totals.auto += res.auto; totals.pendente += res.pendente; totals.indef += res.indef; totals.erros += res.erros; totals.total += res.total;
        toast.message(`Processando... ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
      }
      toast.success(`Importado: ${totals.total} | Auto: ${totals.auto} • Pendente: ${totals.pendente} • Indefinido: ${totals.indef} • Erros: ${totals.erros}`);
      setPreview(null); setHeaders([]); setMapping({}); setFileName("");
      if (fileRef.current) fileRef.current.value = "";
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
        <CardTitle>Importar planilha</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Colunas esperadas: <b>Superintendente, Gerente, Fonte, Canal, Usuário, Criado em, Título do lead, Contagem</b>.
          A coluna <b>Contagem</b> é usada para contar leads (cada linha = 1 por padrão).
        </div>

        <div className="flex items-center gap-3">
          <Input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="max-w-md" />
          {preview && (
            <Button onClick={doImport} disabled={importing}>
              <Upload className="h-4 w-4 mr-2" />
              {importing ? "Importando..." : `Importar ${preview.length} linhas`}
            </Button>
          )}
        </div>

        {preview && headers.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Mapeamento de colunas</div>
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
                      {fieldOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="text-sm font-medium pt-3">Prévia (5 primeiras linhas)</div>
            <div className="overflow-auto border rounded-md max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 5).map((r, i) => (
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

// ============ VALIDAÇÃO (agrupada por título) ============
type Grupo = {
  key: string;
  nome: string;
  produto_sugerido_id: string | null;
  produto_sugerido_nome: string | null;
  total_leads: number;
  total_contagem: number;
  score_medio: number;
  lead_ids: string[];
  status_resumo: string;
};

function ValidarTab({ token, leads, produtos, onDone }: { token: string; leads: Lead[]; produtos: Produto[]; onDone: () => void }) {
  const [busca, setBusca] = useState("");
  const prodMap = useMemo(() => new Map(produtos.map(p => [p.id, p.nome])), [produtos]);

  const grupos: Grupo[] = useMemo(() => {
    const pend = leads.filter(l => l.status === "pendente" || l.status === "indefinido");
    const mp = new Map<string, Grupo>();
    for (const l of pend) {
      const key = l.nome_normalizado || l.nome_original;
      const existing = mp.get(key);
      const cont = l.contagem ?? 1;
      if (existing) {
        existing.total_leads += 1;
        existing.total_contagem += cont;
        existing.lead_ids.push(l.id);
        existing.score_medio = (existing.score_medio * (existing.total_leads - 1) + l.score) / existing.total_leads;
      } else {
        mp.set(key, {
          key,
          nome: l.nome_original,
          produto_sugerido_id: l.produto_sugerido_id,
          produto_sugerido_nome: l.produto_sugerido_id ? (prodMap.get(l.produto_sugerido_id) ?? null) : null,
          total_leads: 1,
          total_contagem: cont,
          score_medio: l.score,
          lead_ids: [l.id],
          status_resumo: l.status,
        });
      }
    }
    let arr = Array.from(mp.values()).sort((a, b) => b.total_contagem - a.total_contagem);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter(g => g.nome.toLowerCase().includes(q));
    }
    return arr;
  }, [leads, prodMap, busca]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input placeholder="Buscar título..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
        <div className="text-sm text-muted-foreground">
          {grupos.length} título(s) • {grupos.reduce((a, g) => a + g.total_contagem, 0)} leads
        </div>
      </div>

      {grupos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum lead pendente de validação.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => (
            <GrupoRow key={g.key} grupo={g} produtos={produtos} token={token} onDone={onDone} />
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoRow({ grupo, produtos, token, onDone }: { grupo: Grupo; produtos: Produto[]; token: string; onDone: () => void }) {
  const [selProduto, setSelProduto] = useState<string>(grupo.produto_sugerido_id ?? "");
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [working, setWorking] = useState(false);

  async function aprovar(produto_id: string) {
    setWorking(true);
    try {
      await leadsConfirmBulk({ data: { token, lead_ids: grupo.lead_ids, produto_id, criar_alias: true } });
      toast.success(`Validado: ${grupo.total_leads} lead(s) → ${produtos.find(p => p.id === produto_id)?.nome ?? ""}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    } finally {
      setWorking(false);
    }
  }

  async function criarProdutoEAplicar() {
    if (!novoNome.trim()) return;
    setWorking(true);
    try {
      await leadsCriarProdutoBulk({ data: { token, lead_ids: grupo.lead_ids, nome: novoNome.trim() } });
      toast.success(`Produto criado e ${grupo.total_leads} lead(s) atribuído(s)`);
      setNovoOpen(false); setNovoNome("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <div className="font-medium text-sm">{grupo.nome}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{grupo.total_leads} ocorrência(s)</span>
              <span>•</span>
              <span><b>{grupo.total_contagem}</b> leads</span>
              {grupo.produto_sugerido_nome && (
                <>
                  <span>•</span>
                  <Sparkles className="h-3 w-3" />
                  <span>Sugestão: <b>{grupo.produto_sugerido_nome}</b> ({(grupo.score_medio * 100).toFixed(0)}%)</span>
                </>
              )}
            </div>
          </div>

          {grupo.produto_sugerido_id && (
            <Button size="sm" variant="default" disabled={working} onClick={() => aprovar(grupo.produto_sugerido_id!)}>
              <Check className="h-4 w-4 mr-1" /> Aceitar sugestão
            </Button>
          )}

          <Select value={selProduto} onValueChange={setSelProduto}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Escolher outro produto..." /></SelectTrigger>
            <SelectContent>
              {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" disabled={!selProduto || working} onClick={() => aprovar(selProduto)}>
            Aplicar
          </Button>

          <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
            <Button size="sm" variant="outline" onClick={() => setNovoOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-1" /> Novo produto
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar novo produto</DialogTitle>
                <DialogDescription>O título "{grupo.nome}" virará alias e {grupo.total_leads} lead(s) serão atribuído(s).</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Nome do produto</Label>
                <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Residencial Vivace" />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNovoOpen(false)}>Cancelar</Button>
                <Button onClick={criarProdutoEAplicar} disabled={!novoNome.trim() || working}>Criar e aplicar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ BATCHES ============
function BatchesTab({ token, batches, onDone }: { token: string; batches: Batch[]; onDone: () => void }) {
  async function excluir(id: string) {
    try {
      const r = await leadsImportBatchDelete({ data: { token, batch_id: id } }) as any;
      toast.success(`Lote excluído (${r.deleted ?? 0} leads removidos)`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Importações</CardTitle></CardHeader>
      <CardContent>
        {!batches.length ? (
          <div className="text-sm text-muted-foreground">Nenhum lote importado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Auto</TableHead>
                <TableHead className="text-right">Pendente</TableHead>
                <TableHead className="text-right">Indefinido</TableHead>
                <TableHead className="text-right">Erros</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs">{fmtDateTime(b.created_at)}</TableCell>
                  <TableCell className="text-sm">{b.arquivo_nome ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{b.total}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">{b.auto}</TableCell>
                  <TableCell className="text-right font-mono text-amber-600">{b.pendente}</TableCell>
                  <TableCell className="text-right font-mono text-rose-600">{b.indefinido}</TableCell>
                  <TableCell className="text-right font-mono">{b.erros}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir lote</AlertDialogTitle>
                          <AlertDialogDescription>Isto remove todos os leads importados neste lote. Não pode ser desfeito.</AlertDialogDescription>
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

// ============ PRODUTOS & ALIASES ============
function ProdutosTab({ token, onDone: _onDone }: { token: string; onDone: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ alias_id: string; alias: string; produto_atual_id: string; produto_atual_nome: string } | null>(null);
  const [novoProdutoId, setNovoProdutoId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const reload = () => {
    if (!token) return;
    setLoading(true);
    produtosList({ data: { token } }).then((r) => setItems(r as any[])).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function confirmarMover() {
    if (!editing || !novoProdutoId || novoProdutoId === editing.produto_atual_id) return;
    setSaving(true);
    try {
      const r = await leadsAliasMover({ data: { token, alias_id: editing.alias_id, novo_produto_id: novoProdutoId } });
      toast.success(`Alias movido. ${r.movidos ?? 0} lead(s) reclassificado(s). Aprendizado recalculado.`);
      setEditing(null);
      setNovoProdutoId("");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao mover alias");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Produtos & Aliases (aprendizado)</CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="text-sm text-muted-foreground">Carregando...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Aliases aprendidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(p.produto_aliases ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {(p.produto_aliases ?? []).map((a: any) => (
                        <Badge key={a.id} variant="secondary" className="text-xs gap-1">
                          {a.alias} <span className="opacity-60">×{a.vezes_usado ?? 0}</span>
                          <button
                            type="button"
                            className="ml-1 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Mover alias para outro produto"
                            onClick={() => {
                              setEditing({ alias_id: a.id, alias: a.alias, produto_atual_id: p.id, produto_atual_nome: p.nome });
                              setNovoProdutoId("");
                            }}
                          >
                            ✎
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setNovoProdutoId(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mover alias para outro produto</DialogTitle>
              <DialogDescription>
                Alias <strong>{editing?.alias}</strong> está vinculado a <strong>{editing?.produto_atual_nome}</strong>.
                Ao mover, os leads aprovados por esse alias serão reclassificados e o aprendizado dos dois produtos será recalculado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Novo produto</Label>
              <Select value={novoProdutoId} onValueChange={setNovoProdutoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto destino" /></SelectTrigger>
                <SelectContent>
                  {items.filter((p) => p.id !== editing?.produto_atual_id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditing(null); setNovoProdutoId(""); }} disabled={saving}>Cancelar</Button>
              <Button onClick={confirmarMover} disabled={!novoProdutoId || saving}>{saving ? "Movendo..." : "Mover alias"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ============ RESUMO (hierarquia) ============
export function ResumoTab({ leads, produtos }: { leads: Lead[]; produtos: Produto[] }) {
  const prodMap = useMemo(() => new Map(produtos.map((p) => [p.id, p.nome])), [produtos]);

  // ===== Filtros (multi-seleção; vazio = todos) =====
  const [fSup, setFSup] = useState<Set<string>>(new Set());
  const [fGer, setFGer] = useState<Set<string>>(new Set());
  const [fProd, setFProd] = useState<Set<string>>(new Set());
  const [fFonte, setFFonte] = useState<Set<string>>(new Set());
  const [fCanal, setFCanal] = useState<Set<string>>(new Set());
  const [dtIni, setDtIni] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");

  // Opções derivadas dos próprios leads
  const opcoes = useMemo(() => {
    const sups = new Set<string>();
    const gers = new Set<string>();
    const prods = new Set<string>();
    const fontes = new Set<string>();
    const canais = new Set<string>();
    for (const l of leads) {
      if (l.superintendente?.trim()) sups.add(l.superintendente.trim());
      if (l.gerente?.trim()) gers.add(l.gerente.trim());
      const pn = l.produto_id ? prodMap.get(l.produto_id) : null;
      if (pn) prods.add(pn);
      if (l.fonte?.trim()) fontes.add(l.fonte.trim());
      if (l.canal?.trim()) canais.add(l.canal.trim());
    }
    const sort = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { sups: sort(sups), gers: sort(gers), prods: sort(prods), fontes: sort(fontes), canais: sort(canais) };
  }, [leads, prodMap]);

  // Gerentes filtrados por superintendente selecionado
  const gerentesFiltrados = useMemo(() => {
    if (fSup.size === 0) return opcoes.gers;
    const s = new Set<string>();
    for (const l of leads) {
      const sup = l.superintendente?.trim() || "";
      if (fSup.has(sup) && l.gerente?.trim()) s.add(l.gerente.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [leads, fSup, opcoes.gers]);

  const leadsFiltrados = useMemo(() => {
    const ini = dtIni ? new Date(dtIni + "T00:00:00").getTime() : null;
    const fim = dtFim ? new Date(dtFim + "T23:59:59").getTime() : null;
    return leads.filter((l) => {
      if (fSup.size && !fSup.has(l.superintendente?.trim() || "")) return false;
      if (fGer.size && !fGer.has(l.gerente?.trim() || "")) return false;
      if (fProd.size) {
        const pn = l.produto_id ? prodMap.get(l.produto_id) : null;
        if (!fProd.has(pn ?? "")) return false;
      }
      if (fFonte.size && !fFonte.has(l.fonte?.trim() || "")) return false;
      if (fCanal.size && !fCanal.has(l.canal?.trim() || "")) return false;
      if (ini || fim) {
        const t = new Date(l.created_at).getTime();
        if (ini && t < ini) return false;
        if (fim && t > fim) return false;
      }
      return true;
    });
  }, [leads, prodMap, fSup, fGer, fProd, fFonte, fCanal, dtIni, dtFim]);

  function limparFiltros() {
    setFSup(new Set()); setFGer(new Set()); setFProd(new Set());
    setFFonte(new Set()); setFCanal(new Set());
    setDtIni(""); setDtFim("");
  }

  const hierarquia = useMemo(() => {
    // superintendente -> gerente -> produto -> total
    const tree = new Map<string, Map<string, Map<string, number>>>();
    let totalGeral = 0;

    for (const l of leadsFiltrados) {
      const sup = l.superintendente?.trim() || "— Sem superintendente —";
      const ger = l.gerente?.trim() || "— Sem gerente —";
      const prodNome = l.produto_id ? (prodMap.get(l.produto_id) ?? "— Produto não definido —") : "— Produto não definido —";
      const cont = l.contagem ?? 1;

      if (!tree.has(sup)) tree.set(sup, new Map());
      const gerMap = tree.get(sup)!;
      if (!gerMap.has(ger)) gerMap.set(ger, new Map());
      const prodMap2 = gerMap.get(ger)!;
      prodMap2.set(prodNome, (prodMap2.get(prodNome) ?? 0) + cont);
      totalGeral += cont;
    }

    // Ordenar por total decrescente em cada nível
    const sorted = Array.from(tree.entries()).map(([sup, gerMap]) => {
      const gerentesArr = Array.from(gerMap.entries()).map(([ger, prodMap2]) => {
        const produtosArr = Array.from(prodMap2.entries())
          .map(([prod, total]) => ({ prod, total }))
          .sort((a, b) => b.total - a.total);
        const totalGer = produtosArr.reduce((s, p) => s + p.total, 0);
        return { ger, total: totalGer, produtos: produtosArr };
      }).sort((a, b) => b.total - a.total);
      const totalSup = gerentesArr.reduce((s, g) => s + g.total, 0);
      return { sup, total: totalSup, gerentes: gerentesArr };
    }).sort((a, b) => b.total - a.total);

    return { tree: sorted, totalGeral };
  }, [leadsFiltrados, prodMap]);

  if (!leads.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Nenhum lead para exibir no resumo.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Filtros</CardTitle>
            <Button size="sm" variant="ghost" onClick={limparFiltros}>Limpar</Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Superintendente</Label>
            <MultiSelectFilter
              options={opcoes.sups}
              selected={fSup}
              onChange={(s) => { setFSup(s); setFGer(new Set()); }}
              placeholder="Todos"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Gerente</Label>
            <MultiSelectFilter
              options={gerentesFiltrados}
              selected={fGer}
              onChange={setFGer}
              placeholder="Todos"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Produto</Label>
            <MultiSelectFilter
              options={opcoes.prods}
              selected={fProd}
              onChange={setFProd}
              placeholder="Todos"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fonte</Label>
            <MultiSelectFilter
              options={opcoes.fontes}
              selected={fFonte}
              onChange={setFFonte}
              placeholder="Todas"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Canal</Label>
            <MultiSelectFilter
              options={opcoes.canais}
              selected={fCanal}
              onChange={setFCanal}
              placeholder="Todos"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data inicial</Label>
            <Input type="date" value={dtIni} onChange={(e) => setDtIni(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data final</Label>
            <Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Total de leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{hierarquia.totalGeral}</div>
        </CardContent>
      </Card>

      <ResumoPorGerente leadsFiltrados={leadsFiltrados} />
      <ResumoPorProduto leadsFiltrados={leadsFiltrados} prodMap={prodMap} />

      <div>
        <div className="text-sm font-semibold mb-2 text-muted-foreground">Hierarquia completa</div>
      <Accordion type="multiple" className="space-y-2">
        {hierarquia.tree.map((supNode) => (
          <Card key={supNode.sup} className="border-l-4 border-l-accent">
            <AccordionItem value={supNode.sup} className="border-0">
              <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    <span className="font-semibold text-sm">{supNode.sup}</span>
                  </div>
                  <Badge className="ml-2 bg-accent text-accent-foreground hover:bg-accent">{supNode.total} leads</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="space-y-3 pl-4 border-l-2 border-primary/40">
                  {supNode.gerentes.map((gerNode) => (
                    <div key={gerNode.ger} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          <span className="font-medium text-primary">{gerNode.ger}</span>
                        </div>
                        <Badge variant="outline" className="text-xs border-primary/40 text-primary">{gerNode.total} leads</Badge>
                      </div>
                      <div className="pl-4 space-y-1 border-l-2 border-secondary/40">
                        {gerNode.produtos.map((p) => (
                          <div key={p.prod} className="flex items-center justify-between text-sm pl-2">
                            <div className="flex items-center gap-2">
                              <span className="h-1 w-1 rounded-full bg-secondary" />
                              <span>{p.prod}</span>
                            </div>
                            <Badge variant="outline" className="text-xs border-secondary/40 text-secondary font-mono tabular-nums">{p.total}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Card>
        ))}
      </Accordion>
      </div>
    </div>
  );
}

// ===== Resumo só por Gerente =====
function ResumoPorGerente({ leadsFiltrados }: { leadsFiltrados: Lead[] }) {
  const lista = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leadsFiltrados) {
      const k = l.gerente?.trim() || "— Sem gerente —";
      m.set(k, (m.get(k) ?? 0) + (l.contagem ?? 1));
    }
    return Array.from(m.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [leadsFiltrados]);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Resumo por Gerente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lista.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="divide-y">
            {lista.map((g) => (
              <div key={g.nome} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{g.nome}</span>
                <Badge className="bg-primary text-primary-foreground hover:bg-primary">{g.total}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== Resumo só por Produto =====
function ResumoPorProduto({ leadsFiltrados, prodMap }: { leadsFiltrados: Lead[]; prodMap: Map<string, string> }) {
  const lista = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leadsFiltrados) {
      const nome = l.produto_id ? (prodMap.get(l.produto_id) ?? "— Produto não definido —") : "— Produto não definido —";
      m.set(nome, (m.get(nome) ?? 0) + (l.contagem ?? 1));
    }
    return Array.from(m.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [leadsFiltrados, prodMap]);

  return (
    <Card className="border-l-4 border-l-secondary">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          Resumo por Produto
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lista.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="divide-y">
            {lista.map((p) => (
              <div key={p.nome} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{p.nome}</span>
                <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">{p.total}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// keep references to avoid lint warnings
void fmtDate;
void statusBadge;

// ===== Multi-select com "Selecionar todos" =====
function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  placeholder: string;
}) {
  const allSelected = selected.size > 0 && options.every((o) => selected.has(o));
  function toggle(opt: string) {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(next);
  }
  function toggleAll() {
    if (allSelected) onChange(new Set());
    else onChange(new Set(options));
  }
  const label =
    selected.size === 0 || allSelected
      ? placeholder
      : selected.size === 1
        ? Array.from(selected)[0]
        : `${selected.size} selecionados`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
          type="button"
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="max-h-72 overflow-auto p-1">
          {options.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">Sem opções</div>
          ) : (
            <>
              <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer border-b mb-1">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                <span className="text-sm font-medium">Selecionar todos</span>
              </label>
              {options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                >
                  <Checkbox checked={selected.has(opt)} onCheckedChange={() => toggle(opt)} />
                  <span className="text-sm truncate">{opt}</span>
                </label>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============ VÍNCULOS (Hierarquia) ============
type SupAliasRow = {
  alias: string;
  alias_normalizado: string;
  profile_id: string | null;
  suggested_profile_id: string | null;
  alias_row_id: string | null;
};
type GerAliasRow = {
  alias: string;
  alias_normalizado: string;
  gerente_id: string | null;
  suggested_gerente_id: string | null;
  alias_row_id: string | null;
};
type ProfileRef = { id: string; nome: string; diretor_id: string | null };
type GerenteRef = { id: string; nome: string; superintendente_id: string };

function VinculosTab({ token }: { token: string }) {
  const [sups, setSups] = useState<SupAliasRow[]>([]);
  const [gerentes, setGerentes] = useState<GerAliasRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRef[]>([]);
  const [gerCadastro, setGerCadastro] = useState<GerenteRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  async function reload() {
    if (!token) return;
    setLoading(true);
    try {
      const r = await hierarquiaAliasesList({ data: { token } }) as any;
      setSups(r.sups);
      setGerentes(r.gerentes);
      setProfiles(r.profiles);
      setGerCadastro(r.gerentesCadastro);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar vínculos");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [token]);

  async function saveSup(alias: string, profile_id: string) {
    setWorking(`sup:${alias}`);
    try {
      await hierarquiaAliasUpsert({ data: { token, tipo: "superintendente", alias, profile_id } });
      toast.success("Vínculo salvo");
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }
  async function saveGer(alias: string, gerente_id: string) {
    setWorking(`ger:${alias}`);
    try {
      await hierarquiaAliasUpsert({ data: { token, tipo: "gerente", alias, gerente_id } });
      toast.success("Vínculo salvo");
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }
  async function removerSup(alias_normalizado: string) {
    setWorking(`sup:${alias_normalizado}`);
    try {
      await hierarquiaAliasDelete({ data: { token, tipo: "superintendente", alias_normalizado } });
      toast.success("Vínculo removido");
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }
  async function removerGer(alias_normalizado: string) {
    setWorking(`ger:${alias_normalizado}`);
    try {
      await hierarquiaAliasDelete({ data: { token, tipo: "gerente", alias_normalizado } });
      toast.success("Vínculo removido");
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setWorking(null); }
  }

  const supsPendentes = sups.filter((s) => !s.profile_id).length;
  const gerPendentes = gerentes.filter((g) => !g.gerente_id).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vínculos da hierarquia</CardTitle>
          <p className="text-xs text-muted-foreground">
            Aqui você confere se cada superintendente e gerente que aparece nos leads bate com um usuário cadastrado. Confirme as sugestões automáticas (preenchidas em cinza) ou escolha outro manualmente.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-accent/40 text-accent">Sups: {sups.length - supsPendentes}/{sups.length} vinculados</Badge>
          <Badge variant="outline" className="border-primary/40 text-primary">Gerentes: {gerentes.length - gerPendentes}/{gerentes.length} vinculados</Badge>
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading} className="ml-auto h-7">
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Recarregar
          </Button>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-accent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" /> Superintendentes ({sups.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sups.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum superintendente identificado nos leads.</div>
          ) : (
            <div className="divide-y">
              {sups.map((s) => (
                <SupRow
                  key={s.alias_normalizado}
                  row={s}
                  profiles={profiles}
                  busy={working === `sup:${s.alias}` || working === `sup:${s.alias_normalizado}`}
                  onSave={(pid) => saveSup(s.alias, pid)}
                  onRemove={() => removerSup(s.alias_normalizado)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" /> Gerentes ({gerentes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gerentes.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum gerente identificado nos leads.</div>
          ) : (
            <div className="divide-y">
              {gerentes.map((g) => (
                <GerRow
                  key={g.alias_normalizado}
                  row={g}
                  gerentes={gerCadastro}
                  profiles={profiles}
                  busy={working === `ger:${g.alias}` || working === `ger:${g.alias_normalizado}`}
                  onSave={(gid) => saveGer(g.alias, gid)}
                  onRemove={() => removerGer(g.alias_normalizado)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SupRow({ row, profiles, busy, onSave, onRemove }: {
  row: SupAliasRow;
  profiles: ProfileRef[];
  busy: boolean;
  onSave: (pid: string) => void;
  onRemove: () => void;
}) {
  const initial = row.profile_id ?? row.suggested_profile_id ?? "";
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(row.profile_id ?? row.suggested_profile_id ?? ""); }, [row.profile_id, row.suggested_profile_id]);
  const isSugestao = !row.profile_id && !!row.suggested_profile_id;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium">{row.alias}</div>
        <div className="text-[11px] text-muted-foreground">
          {row.profile_id ? "Vinculado" : isSugestao ? "Sugestão automática" : "Pendente"}
        </div>
      </div>
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className={`w-[220px] ${isSugestao && !row.profile_id ? "border-amber-500/50" : ""}`}>
          <SelectValue placeholder="Escolher superintendente..." />
        </SelectTrigger>
        <SelectContent>
          {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!val || busy || val === row.profile_id} onClick={() => onSave(val)}>
        <Check className="h-4 w-4 mr-1" /> {row.profile_id ? "Atualizar" : "Confirmar"}
      </Button>
      {row.profile_id && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-rose-600" />
        </Button>
      )}
    </div>
  );
}

function GerRow({ row, gerentes, profiles, busy, onSave, onRemove }: {
  row: GerAliasRow;
  gerentes: GerenteRef[];
  profiles: ProfileRef[];
  busy: boolean;
  onSave: (gid: string) => void;
  onRemove: () => void;
}) {
  const initial = row.gerente_id ?? row.suggested_gerente_id ?? "";
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(row.gerente_id ?? row.suggested_gerente_id ?? ""); }, [row.gerente_id, row.suggested_gerente_id]);
  const isSugestao = !row.gerente_id && !!row.suggested_gerente_id;
  const supById = useMemo(() => new Map(profiles.map(p => [p.id, p.nome])), [profiles]);

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium">{row.alias}</div>
        <div className="text-[11px] text-muted-foreground">
          {row.gerente_id ? "Vinculado" : isSugestao ? "Sugestão automática" : "Pendente"}
        </div>
      </div>
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className={`w-[260px] ${isSugestao && !row.gerente_id ? "border-amber-500/50" : ""}`}>
          <SelectValue placeholder="Escolher gerente..." />
        </SelectTrigger>
        <SelectContent>
          {gerentes.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.nome} <span className="opacity-60">— {supById.get(g.superintendente_id) ?? "?"}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!val || busy || val === row.gerente_id} onClick={() => onSave(val)}>
        <Check className="h-4 w-4 mr-1" /> {row.gerente_id ? "Atualizar" : "Confirmar"}
      </Button>
      {row.gerente_id && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-rose-600" />
        </Button>
      )}
    </div>
  );
}
