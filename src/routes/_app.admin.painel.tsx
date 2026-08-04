import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { pushUndo } from "@/lib/undo";
import { ArrowLeft, Plus, Trash2, Settings2, Package, Power, PowerOff, Tag, X, CalendarCheck, Radar, Users, FolderKanban, ChevronRight, Sheet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  produtosPrevisaoList,
  produtoPrevisaoCreate,
  produtoPrevisaoToggleAtivo,
  produtoPrevisaoDelete,
  produtoAliasUpsert,
  produtoAliasDelete,
} from "@/functions/vendas.functions";


export const Route = createFileRoute("/_app/admin/painel")({
  component: PainelControle,
});

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const PLANTOES_PADRAO = [
  "Anastácio | Mutinga",
  "Barra Funda",
  "Butantã | Villa Lobos | Jaguaré",
  "Água Branca",
  "Guarulhos",
  "Granja Julieta | Chácara Santo Antônio",
  "Parque das Nações",
  "Carrão",
  "Vila Leopoldina",
  "Freguesia do Ó",
  "Estoques",
];

type PlantaoRow = { id: string; nome: string; ordem: number };

function PainelControle() {
  const { role, loading: authLoading } = useAuth();
  const now = new Date();
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [ano, setAno] = useState<number>(now.getFullYear());
  const [rows, setRows] = useState<PlantaoRow[]>([]);
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);
  const [secao, setSecao] = useState<"hub" | "plantoes" | "produtos">("hub");

  const anos = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1, y + 2];
  }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("plantoes_mes")
      .select("id, nome, ordem")
      .eq("ano", ano)
      .eq("mes", mes)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) return toast.error(error.message);
    setRows((data || []) as PlantaoRow[]);
  };

  useEffect(() => {
    if (role === "admin") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, ano, role]);

  const adicionar = async (nome: string) => {
    const n = nome.trim();
    if (!n) return;
    if (rows.some((r) => r.nome.toLowerCase() === n.toLowerCase())) {
      return toast.error("Plantão já cadastrado neste mês");
    }
    setBusy(true);
    const proxOrdem = rows.length > 0 ? Math.max(...rows.map((r) => r.ordem)) + 1 : 0;
    const { error } = await supabase
      .from("plantoes_mes")
      .insert({ ano, mes, nome: n, ordem: proxOrdem });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNovo("");
    load();
  };

  const remover = async (id: string) => {
    const { data: snap } = await supabase.from("plantoes_mes").select("*").eq("id", id);
    const { error } = await supabase.from("plantoes_mes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    pushUndo("Plantão excluído", [{ table: "plantoes_mes", rows: snap || [] }]);
    load();
  };

  const copiarMesAnterior = async () => {
    let mAnt = mes - 1;
    let aAnt = ano;
    if (mAnt < 1) { mAnt = 12; aAnt = ano - 1; }
    const { data } = await supabase
      .from("plantoes_mes")
      .select("nome, ordem")
      .eq("ano", aAnt)
      .eq("mes", mAnt)
      .order("ordem");
    const fonte = (data || []) as Array<{ nome: string; ordem: number }>;
    if (fonte.length === 0) return toast.error("Mês anterior não tem plantões cadastrados");
    const existentes = new Set(rows.map((r) => r.nome.toLowerCase()));
    const insercoes = fonte
      .filter((f) => !existentes.has(f.nome.toLowerCase()))
      .map((f) => ({ ano, mes, nome: f.nome, ordem: f.ordem }));
    if (insercoes.length === 0) return toast.info("Nada a copiar");
    const { error } = await supabase.from("plantoes_mes").insert(insercoes);
    if (error) return toast.error(error.message);
    toast.success(`${insercoes.length} plantão(ões) copiado(s)`);
    load();
  };

  const aplicarPadrao = async () => {
    const existentes = new Set(rows.map((r) => r.nome.toLowerCase()));
    const insercoes = PLANTOES_PADRAO
      .filter((p) => !existentes.has(p.toLowerCase()))
      .map((p, i) => ({ ano, mes, nome: p, ordem: i }));
    if (insercoes.length === 0) return toast.info("Já contém todos os plantões padrão");
    const { error } = await supabase.from("plantoes_mes").insert(insercoes);
    if (error) return toast.error(error.message);
    toast.success(`${insercoes.length} plantão(ões) adicionado(s)`);
    load();
  };

  if (authLoading) return null;
  if (role !== "admin") {
    return <div className="p-6">Acesso restrito.</div>;
  }

  return (
    <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10">
      <CyberBackdrop />
      <div className="relative z-10 container mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
            // PAINEL DE CONTROLE
          </div>
        </div>
        {secao !== "hub" && (
          <Button variant="ghost" size="sm" onClick={() => setSecao("hub")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        )}
      </div>

      {secao === "hub" && (
        <HubBotoes onSelect={(s) => setSecao(s)} />
      )}

      {secao === "plantoes" && (
      <Card>
        <CardHeader>
          <CardTitle>Plantões abertos por mês</CardTitle>
          <CardDescription>
            Defina quais plantões aparecerão para os usuários ao preencher o Planejamento. Quando nenhum plantão for cadastrado para o mês, a lista padrão será usada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[180px]">
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px]">
              <Label>Ano</Label>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={copiarMesAnterior}>Copiar do mês anterior</Button>
            <Button variant="outline" onClick={aplicarPadrao}>Aplicar lista padrão</Button>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Nome do plantão (ex.: Barra Funda)"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(novo); } }}
            />
            <Button onClick={() => adicionar(novo)} disabled={busy || !novo.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>

          <div className="rounded-md border divide-y">
            {rows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Nenhum plantão cadastrado para {MESES[mes - 1]}/{ano}. A lista padrão será exibida aos usuários.
              </div>
            ) : rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{r.nome}</span>
                <Button variant="ghost" size="icon" onClick={() => remover(r.id)} title="Remover">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {secao === "produtos" && <ProdutosPrevisaoCard />}
      </div>
    </div>
  );
}

function HubBotoes({ onSelect }: { onSelect: (s: "plantoes" | "produtos") => void }) {
  const botoes: Array<{
    key: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    to?: string;
  }> = [
    { key: "plantoes", title: "// PLANEJAMENTO", icon: CalendarCheck, onClick: () => onSelect("plantoes") },
    { key: "produtos", title: "PREVISÃO", icon: Package, onClick: () => onSelect("produtos") },
    { key: "c2s", title: "C2S", icon: Radar, to: "/admin/leads" },
    { key: "usuarios", title: "USUÁRIOS", icon: Users, to: "/admin/usuarios" },
    { key: "vendas", title: "VENDAS", icon: Sheet, to: "/admin/vendas" },
    { key: "pastas", title: "PASTAS", icon: FolderKanban, to: "/pastas" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {botoes.map((b) => {
        const inner = (
          <div className="group relative overflow-hidden rounded-xl border border-[#39FF14]/30 bg-black/40 backdrop-blur-md p-5 transition hover:border-[#39FF14] hover:shadow-[0_0_24px_-6px_#39FF14] cursor-pointer h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-[#39FF14]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#39FF14]/40 bg-black/60 text-[#39FF14] group-hover:scale-110 transition-transform">
                <b.icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold text-white truncate">{b.title}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-[#39FF14]/60 group-hover:text-[#39FF14] group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        );
        if (b.to) {
          return (
            <Link key={b.key} to={b.to} className="block">
              {inner}
            </Link>
          );
        }
        return (
          <button key={b.key} type="button" onClick={b.onClick} className="text-left">
            {inner}
          </button>
        );
      })}
    </div>
  );
}

// ===================== Produtos da Previsão =====================
type ProdutoRow = {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  aliases: { id: string; alias: string; alias_normalizado: string; vezes_usado: number }[];
  previsoes_count: number;
};

function ProdutosPrevisaoCard() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [rows, setRows] = useState<ProdutoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ProdutoRow | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const r = (await produtosPrevisaoList({ data: { token } })) as ProdutoRow[];
      setRows(r);
      if (editing) {
        const updated = r.find((p) => p.id === editing.id);
        if (updated) setEditing(updated);
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao carregar produtos"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function criar() {
    const nome = novo.trim();
    if (!nome) return;
    setBusy(true);
    try {
      const r = await produtoPrevisaoCreate({ data: { token, nome } }) as { already: boolean };
      if (r.already) toast.info("Esse produto já existe");
      else toast.success("Produto criado");
      setNovo("");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setBusy(false); }
  }

  async function toggle(p: ProdutoRow) {
    try {
      await produtoPrevisaoToggleAtivo({ data: { token, id: p.id, ativo: !p.ativo } });
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  async function excluir(p: ProdutoRow) {
    if (p.previsoes_count > 0) { toast.error("Produto possui previsões — inative em vez de excluir"); return; }
    try {
      await produtoPrevisaoDelete({ data: { token, id: p.id } });
      toast.success("Produto excluído");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Produtos da Previsão</CardTitle>
        <CardDescription>
          Cadastre os produtos que serão lançados nas previsões. Ao importar a base de vendas, você poderá associar cada empreendimento a um produto — esses nomes ficam aprendidos como aliases para as próximas importações.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Nome do produto (ex.: Cury Vila Maria)"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criar(); } }}
          />
          <Button onClick={criar} disabled={busy || !novo.trim()}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>

        <div className="rounded-md border divide-y">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhum produto cadastrado.</div>
          ) : rows.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {p.nome}
                  {!p.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                  <span>{p.previsoes_count} previsão(ões)</span>
                  <span>{p.aliases.length} alias(es)</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                <Tag className="h-4 w-4 mr-1" /> Aliases
              </Button>
              <Button size="icon" variant="ghost" onClick={() => toggle(p)} title={p.ativo ? "Inativar" : "Ativar"}>
                {p.ativo ? <PowerOff className="h-4 w-4 text-muted-foreground" /> : <Power className="h-4 w-4 text-emerald-600" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => excluir(p)} title="Excluir" disabled={p.previsoes_count > 0}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aliases — {editing?.nome}</DialogTitle>
          </DialogHeader>
          {editing && (
            <AliasesEditor token={token} produto={editing} onChange={load} />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AliasesEditor({ token, produto, onChange }: { token: string; produto: ProdutoRow; onChange: () => void }) {
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const alias = novo.trim();
    if (!alias) return;
    setBusy(true);
    try {
      await produtoAliasUpsert({ data: { token, produto_id: produto.id, alias } });
      setNovo("");
      onChange();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await produtoAliasDelete({ data: { token, id } }); onChange(); }
    catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Cada alias é um nome alternativo (ex: como aparece no nome do empreendimento na planilha de vendas) que será mapeado automaticamente para este produto.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="Novo alias (ex.: VILA MARIA RES.)"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button onClick={add} disabled={busy || !novo.trim()}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
        {produto.aliases.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Nenhum alias cadastrado.</div>
        ) : produto.aliases.map((a) => (
          <div key={a.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="flex-1 text-sm truncate">{a.alias}</span>
            <span className="text-[10px] text-muted-foreground">{a.vezes_usado}×</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(a.id)}>
              <X className="h-4 w-4 text-rose-600" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
