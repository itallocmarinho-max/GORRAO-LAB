import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pushUndo } from "@/lib/undo";
import { useAuth } from "@/hooks/useAuth";
import { useActiveFormType } from "@/hooks/useActiveFormType";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Plus, FileText, Trash2 } from "lucide-react";
import { StatusBadge } from "@/lib/status";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TIPOS_FORMULARIO, type TipoFormulario, tipoLabel, destinacaoFromTipoGasto } from "@/lib/form-types";
import { useHierarquia } from "@/hooks/useHierarquia";
import { CyberBackdrop } from "@/components/CyberBackdrop";



export const Route = createFileRoute("/_app/dashboard")({
  validateSearch: (s: Record<string, unknown>) => ({ tipo: typeof s.tipo === "string" ? s.tipo : undefined }),
  head: () => ({
    meta: [
      { title: "// Nova Prestação — DIRETORIA GORRÃO" },
      { name: "description", content: "Acompanhe e gerencie prestações de contas, verbas e relatórios da Diretoria Gorrão." },
      { property: "og:title", content: "// Nova Prestação — DIRETORIA GORRÃO" },
      { property: "og:description", content: "Acompanhe e gerencie prestações de contas, verbas e relatórios da Diretoria Gorrão." },
      { property: "og:url", content: "https://diretoriagorrao.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://diretoriagorrao.lovable.app/dashboard" }],
  }),
  component: Dashboard,
});

interface Form {
  id: string;
  nome: string | null;
  diretor: string | null;
  superintendente: string | null;
  responsavel: string | null;
  tipo: string;
  mes_referencia: number | null;
  ano_referencia: number | null;
  valor_agilitas: number;
  valor_marketing: number;
  created_at: string;
  status: string;
  usuario_id?: string | null;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function Dashboard() {
  const { user, session, role, nome: nomeUsuario, canEdit, isAdmin, isDiretor, isRH, vinculadoId } = useAuth();
  const { setActiveFormType } = useActiveFormType();
  const [vinculadoNome, setVinculadoNome] = useState<string | null>(null);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [forms, setForms] = useState<Form[]>([]);
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string }>>([]);
  const [disponivelMap, setDisponivelMap] = useState<Record<string, number>>({});
  const [gerentesMap, setGerentesMap] = useState<Record<string, string[]>>({});
  const [planMap, setPlanMap] = useState<Record<string, { sup: string | null; metaSup: number; verbaTotal: number; corretoresAcelera: number }>>({});
  const [gastosMap, setGastosMap] = useState<Record<string, { gv: number; mn: number; total: number }>>({});
  const [contratacaoMap, setContratacaoMap] = useState<Record<string, { candidatos: number; contratados: number; total: number }>>({});
  const [open, setOpen] = useState(false);
  const tipoAtivo = (search.tipo as TipoFormulario | undefined) || "verba_cury";
  const [filtroMes, setFiltroMes] = useState<string>("todos");
  const [filtroAno, setFiltroAno] = useState<string>("todos");
  const [filtroSup, setFiltroSup] = useState<string>("todos");
  const [filtroGerente, setFiltroGerente] = useState<string>("todos");
  const [filtroDiretor, setFiltroDiretor] = useState<string>("todos");
  const { diretores, supsByDiretorNome, gerentesByDiretorSup, superintendentes } = useHierarquia();
  const tipo = tipoAtivo;
  const cyberAtivo = tipoAtivo === "verba_cury" || tipoAtivo === "planejamento" || tipoAtivo === "gastos_pessoais" || tipoAtivo === "contratacao";
  const cyberTipo = tipo === "verba_cury" || tipo === "planejamento" || tipo === "gastos_pessoais" || tipo === "contratacao";
  const [nome, setNome] = useState("");
  const [diretor, setDiretor] = useState("");
  const [superintendente, setSuperintendente] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [paraOutro, setParaOutro] = useState(false);
  const now = new Date();
  const [mes, setMes] = useState(String(now.getMonth() + 1));
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [semana, setSemana] = useState<string>("");
  const [agilitas, setAgilitas] = useState("");
  const [marketing, setMarketing] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveFormType(tipoAtivo);
  }, [tipoAtivo, setActiveFormType]);

  const load = async () => {
    let query = supabase.from("formularios").select("*").order("created_at", { ascending: false });
    if (role !== "admin") {
      const ownerId = isRH && vinculadoId ? vinculadoId : user!.id;
      query = query.eq("usuario_id", ownerId);
    }
    const { data, error } = await query;
    if (error) return toast.error(error.message);
    const list = data || [];
    setForms(list);
    const ids = list.map((f) => f.id);
    if (ids.length) {
      const { data: ls } = await supabase
        .from("lancamentos")
        .select("formulario_id,valor,reprovado,gerente,superintendente,meta_sup,verba_cury,verba_gerente,verba_superintendente,meta_gerente,secao,nome_recebedor,destinacao,tipo_gasto,candidatos,contratados")
        .in("formulario_id", ids);
      const used: Record<string, number> = {};
      const gMap: Record<string, Set<string>> = {};
      const planAgg: Record<string, { sup: string | null; metaSup: number; verbaTotal: number; corretores: Set<string>; aceleraCount: number }> = {};
      const planIds = new Set(list.filter((f) => f.tipo === "planejamento").map((f) => f.id));
      const gastosIds = new Set(list.filter((f) => f.tipo === "gastos_pessoais").map((f) => f.id));
      const gastosAgg: Record<string, { gv: number; mn: number; total: number }> = {};
      const contratacaoIds = new Set(list.filter((f) => f.tipo === "contratacao").map((f) => f.id));
      const contratacaoAgg: Record<string, { candidatos: number; contratados: number; total: number }> = {};
      (ls || []).forEach((l: any) => {
        if (!l.reprovado) used[l.formulario_id] = (used[l.formulario_id] || 0) + Number(l.valor);
        if (l.gerente) {
          (gMap[l.formulario_id] ||= new Set<string>()).add(l.gerente);
        }
        if (gastosIds.has(l.formulario_id) && !l.reprovado) {
          const cur = (gastosAgg[l.formulario_id] ||= { gv: 0, mn: 0, total: 0 });
          const v = Number(l.valor || 0);
          const dest = l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto);
          if (dest === "Gerar Venda") cur.gv += v; else cur.mn += v;
          cur.total += v;
        }
        if (contratacaoIds.has(l.formulario_id) && !l.reprovado) {
          const cur = (contratacaoAgg[l.formulario_id] ||= { candidatos: 0, contratados: 0, total: 0 });
          const c = Number(l.candidatos || 0);
          const ct = Number(l.contratados || 0);
          cur.candidatos += c;
          cur.contratados += ct;
          cur.total += c + ct;
        }
        if (planIds.has(l.formulario_id)) {
          const cur = (planAgg[l.formulario_id] ||= { sup: null, metaSup: 0, verbaTotal: 0, corretores: new Set<string>(), aceleraCount: 0 });
          if (!cur.sup && l.superintendente) cur.sup = l.superintendente;
          const sec = l.secao || "principal";
          if (sec === "principal") {
            cur.metaSup += Number(l.meta_sup || 0);
          }
          if (sec === "verba") {
            cur.verbaTotal += Number(l.verba_cury || 0) + Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0);
          }
          if (sec === "acelera") {
            cur.aceleraCount += 1;
            if (l.nome_recebedor) cur.corretores.add(l.nome_recebedor);
          }
        }
      });
      const map: Record<string, number> = {};
      list.forEach((f) => {
        const total = Number(f.valor_agilitas) + Number(f.valor_marketing);
        map[f.id] = total - (used[f.id] || 0);
      });
      setDisponivelMap(map);
      const gOut: Record<string, string[]> = {};
      Object.entries(gMap).forEach(([k, v]) => { gOut[k] = Array.from(v); });
      setGerentesMap(gOut);
      const pOut: Record<string, { sup: string | null; metaSup: number; verbaTotal: number; corretoresAcelera: number }> = {};
      Object.entries(planAgg).forEach(([k, v]) => {
        pOut[k] = { sup: v.sup, metaSup: v.metaSup, verbaTotal: v.verbaTotal, corretoresAcelera: v.corretores.size || v.aceleraCount };
      });
      setPlanMap(pOut);
      setGastosMap(gastosAgg);
      setContratacaoMap(contratacaoAgg);
    } else {
      setDisponivelMap({});
      setGerentesMap({});
      setPlanMap({});
      setGastosMap({});
      setContratacaoMap({});
    }
  };

  useEffect(() => {
    if (user && session && role) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session, role, isRH, vinculadoId]);

  // Load vinculado profile name when current user is RH
  useEffect(() => {
    (async () => {
      if (!isRH || !vinculadoId) { setVinculadoNome(null); return; }
      const { data } = await supabase
        .from("profiles")
        .select("nome, email")
        .eq("id", vinculadoId)
        .maybeSingle();
      setVinculadoNome(((data as any)?.nome || (data as any)?.email || null) as string | null);
    })();
  }, [isRH, vinculadoId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, email, cargo")
        .order("nome");
      setUsuarios(
        ((data ?? []) as any[])
          .filter((u) => u.cargo !== "administrador" && u.cargo !== "rh")
          .map((u) => ({ id: u.id, nome: u.nome || u.email || "—" })),
      );
    })();
  }, []);

  useEffect(() => {
    if (tipo === "verba_cury") {
      const fallback = isRH ? (vinculadoNome || "") : (nomeUsuario || "");
      if (fallback && !nome) setNome(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipo, nomeUsuario, isRH, vinculadoNome]);

  // Reset filters when switching form type from sidebar
  useEffect(() => {
    setFiltroMes("todos"); setFiltroAno("todos"); setFiltroDiretor("todos"); setFiltroSup("todos"); setFiltroGerente("todos");
  }, [tipoAtivo]);

  const total = (Number(agilitas) || 0) + (Number(marketing) || 0);

  const anos: number[] = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y--) anos.push(y);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const isVerba = tipo === "verba_cury";
    const isContratacao = tipo === "contratacao";
    const isGastos = tipo === "gastos_pessoais";
    const isMeta = tipo === "meta";
    const isAcelera = tipo === "acelera_vendas";
    // Admin pode criar formulários em nome de qualquer usuário (sup/gerente/etc)
    const adminTarget = isAdmin && nome ? usuarios.find((u) => u.nome === nome) : null;
    const effectiveOwnerId = adminTarget
      ? adminTarget.id
      : (isRH && vinculadoId ? vinculadoId : user!.id);
    const effectiveOwnerNome = adminTarget
      ? adminTarget.nome
      : (isRH ? (vinculadoNome || "") : (nomeUsuario || ""));
    const nomeFinal = isVerba
      ? (nome || effectiveOwnerNome || "")
      : isGastos
        ? (effectiveOwnerNome || "")
        : isContratacao
          ? (effectiveOwnerNome || "")
          : nome;
    const segments = [{ mes: Number(mes), ano: Number(ano), semana_inicio: null as string | null }];
    const usaMesAno = (isVerba || isMeta || isGastos || isContratacao || tipo === "planejamento" || tipo === "leads" || isAcelera);
    const rows = segments.map((seg) => ({
      usuario_id: effectiveOwnerId,
      tipo,
      nome: nomeFinal || null,
      diretor: null,
      superintendente: isAcelera ? (superintendente || null) : null,
      responsavel: isGastos
        ? (responsavel || effectiveOwnerNome || null)
        : (isRH ? (effectiveOwnerNome || null) : null),
      mes_referencia: usaMesAno ? seg.mes : null,
      ano_referencia: usaMesAno ? seg.ano : null,
      semana_inicio: null,
      valor_agilitas: isVerba ? (Number(agilitas) || 0) : 0,
      valor_marketing: isVerba ? (Number(marketing) || 0) : 0,
    }));
    const { data, error } = await supabase
      .from("formularios")
      .insert(rows)
      .select();
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.error("Não foi possível criar o formulário (verifique permissões).");
    setOpen(false);
    setNome(""); setDiretor(""); setSuperintendente(""); setResponsavel("");
    setAgilitas(""); setMarketing(""); setParaOutro(false); setSemana("");
    navigate({ to: "/formularios/$id", params: { id: data[0].id } });
  };

  return (
    <div
      className={
        cyberAtivo
          ? "verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10 space-y-8"
          : "relative space-y-6"
      }
    >
      {cyberAtivo && <CyberBackdrop />}
      {cyberAtivo && (
        <div className="relative z-10 mb-2">
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
            {tipoAtivo === "planejamento" ? "// PLANEJAMENTO" : tipoAtivo === "gastos_pessoais" ? "// GASTOS PESSOAIS" : tipoAtivo === "contratacao" ? "// CONTRATAÇÃO" : "// VERBA CURY"}
          </div>
        </div>
      )}
      <div className={`relative z-10 ${tipoAtivo === "planejamento" || tipoAtivo === "gastos_pessoais" || cyberAtivo ? "flex flex-col gap-4" : "flex items-center justify-between"}`}>
        <div>
          {!cyberAtivo && (
            <h1 className="text-2xl font-semibold text-primary whitespace-nowrap">{tipoLabel(tipoAtivo)}</h1>
          )}
          {tipoAtivo !== "planejamento" && tipoAtivo !== "gastos_pessoais" && tipoAtivo !== "verba_cury" && tipoAtivo !== "contratacao" && (
            <p className="text-sm text-muted-foreground">{TIPOS_FORMULARIO.find((t) => t.value === tipoAtivo)?.descricao}</p>
          )}
        </div>
        <div className={cyberAtivo ? "flex w-full items-center gap-2 mt-4" : "flex items-center gap-2"}>
          <Select value={filtroMes} onValueChange={setFiltroMes}>
            <SelectTrigger className={cyberAtivo ? "flex-1 rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]" : "w-[140px]"}><SelectValue placeholder="MÊS" /></SelectTrigger>
            <SelectContent className={cyberAtivo ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300" : undefined}>
              <SelectItem value="todos" className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>TODOS OS MESES</SelectItem>
              {MESES.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)} className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>{m.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroAno} onValueChange={setFiltroAno}>
            <SelectTrigger className={cyberAtivo ? "flex-1 rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]" : "w-[120px]"}><SelectValue placeholder="ANO" /></SelectTrigger>
            <SelectContent className={cyberAtivo ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300" : undefined}>
              <SelectItem value="todos" className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>TODOS OS ANOS</SelectItem>
              {Array.from(new Set(forms.filter((f) => f.tipo === tipoAtivo).map((f) => f.ano_referencia).filter(Boolean) as number[])).sort((a, b) => b - a).map((y) => (
                <SelectItem key={y} value={String(y)} className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroDiretor} onValueChange={(v) => { setFiltroDiretor(v); setFiltroSup("todos"); setFiltroGerente("todos"); }}>
            <SelectTrigger className={cyberAtivo ? "flex-1 rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]" : "w-[180px]"}><SelectValue placeholder="DIRETOR" /></SelectTrigger>
            <SelectContent className={cyberAtivo ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300" : undefined}>
              <SelectItem value="todos" className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>TODOS OS DIRETORES</SelectItem>
              {diretores.map((d) => (
                <SelectItem key={d.id} value={d.nome} className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>{d.nome.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroSup} onValueChange={(v) => { setFiltroSup(v); setFiltroGerente("todos"); }}>
            <SelectTrigger className={cyberAtivo ? "flex-1 rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]" : "w-[200px]"}><SelectValue placeholder="SUPERINTENDENTE" /></SelectTrigger>
            <SelectContent className={cyberAtivo ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300" : undefined}>
              <SelectItem value="todos" className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>TODOS OS SUP.</SelectItem>
              {supsByDiretorNome(filtroDiretor).map((s) => (
                <SelectItem key={s.id} value={s.nome} className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>{s.nome.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroGerente} onValueChange={setFiltroGerente}>
            <SelectTrigger className={cyberAtivo ? "flex-1 rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]" : "w-[200px]"}><SelectValue placeholder="GERENTE" /></SelectTrigger>
            <SelectContent className={cyberAtivo ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300" : undefined}>
              <SelectItem value="todos" className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>TODOS OS GERENTES</SelectItem>
              {gerentesByDiretorSup(filtroDiretor, filtroSup).map((g) => (
                <SelectItem key={g.id} value={g.nome} className={cyberAtivo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>{g.nome.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        {cyberAtivo && <div className="basis-full h-0" />}
        {(canEdit || (!isAdmin && !isDiretor)) && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className={
                cyberAtivo
                  ? "rounded-none bg-transparent border border-[#39FF14] text-[#39FF14] hover:!bg-[#39FF14] hover:!text-black [&_svg]:hover:!text-black font-bold uppercase tracking-widest text-xs transition-colors duration-200"
                  : ""
              }
            >
              <Plus className="mr-1 h-4 w-4" /> {tipoLabel(tipoAtivo)}
            </Button>
          </DialogTrigger>
          <DialogContent
            className={`max-h-[90vh] border-[#1e3a5f] dialog-border-blue overflow-y-auto bg-black/60 backdrop-blur-xl`}
          >
            <div className="max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle
                className={cyberTipo ? "text-[#39FF14] uppercase tracking-[0.25em]" : ""}
              >
                {tipoLabel(tipoAtivo)}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="space-y-4">
              {tipo !== "verba_cury" && (
                <p className="text-xs text-muted-foreground">
                  {TIPOS_FORMULARIO.find((t) => t.value === tipo)?.descricao}
                </p>
              )}
              {tipo === "verba_cury" || tipo === "contratacao" || (isAdmin && (tipo === "gastos_pessoais" || tipo === "planejamento")) ? (
                <div>
                  <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Quem vai prestar conta</Label>
                  <Select value={nome || (isRH ? (vinculadoNome || "") : (nomeUsuario || ""))} onValueChange={setNome} disabled={!isAdmin}>
                    <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"><SelectValue placeholder="SELECIONE UM USUÁRIO..." /></SelectTrigger>
                    <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                      {(isAdmin
                        ? usuarios
                        : isRH
                          ? (vinculadoNome ? [{ id: vinculadoId!, nome: vinculadoNome }] : [])
                          : (nomeUsuario ? [{ id: user!.id, nome: nomeUsuario }] : [])
                      ).map((u) => (
                        <SelectItem key={u.id} value={u.nome} className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10">{u.nome.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : tipo === "gastos_pessoais" || tipo === "planejamento" ? null : (
                <div>
                  <Label>{tipo === "meta" ? "Identificação (opcional)" : "Nome / Identificação"}</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Orçamento equipe SP" required={tipo !== "meta"} />
                </div>
              )}
              {tipo === "acelera_vendas" && (
                <div>
                  <Label>Superintendente</Label>
                  <Input value={superintendente} onChange={(e) => setSuperintendente(e.target.value)} required />
                </div>
              )}
              {(cyberTipo || tipo === "meta" || tipo === "leads" || tipo === "acelera_vendas" || tipo === "contratacao") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={cyberTipo ? "text-gray-400 uppercase tracking-widest text-[10px]" : ""}>Mês de referência</Label>
                  <Select value={mes} onValueChange={(v) => { setMes(v); setSemana(""); }}>
                    <SelectTrigger className={cyberTipo ? "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]" : ""}><SelectValue /></SelectTrigger>
                    <SelectContent className={cyberTipo ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300" : undefined}>
                      {MESES.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)} className={cyberTipo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>{cyberTipo ? m.toUpperCase() : m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={cyberTipo ? "text-gray-400 uppercase tracking-widest text-[10px]" : ""}>Ano de referência</Label>
                  <Select value={ano} onValueChange={setAno}>
                    <SelectTrigger className={cyberTipo ? "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]" : ""}><SelectValue /></SelectTrigger>
                    <SelectContent className={cyberTipo ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300" : undefined}>
                      {anos.map((y) => (
                        <SelectItem key={y} value={String(y)} className={cyberTipo ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10" : undefined}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              )}
              {tipo === "verba_cury" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Valor Agilitas</Label>
                  <Input type="number" step="0.01" value={agilitas} onChange={(e) => setAgilitas(e.target.value)} required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                </div>
                <div>
                  <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Valor Marketing</Label>
                  <Input type="number" step="0.01" value={marketing} onChange={(e) => setMarketing(e.target.value)} required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                </div>
              </div>
              )}
              {tipo === "verba_cury" && (
              <div className="rounded-none border border-[#39FF14]/30 bg-black/40 p-3">
                <div className="text-[10px] text-gray-400 uppercase tracking-widest">Valor Total</div>
                <div className="text-xl font-semibold text-gray-300">{brl(total)}</div>
              </div>
              )}
              <Button type="submit" className="w-full rounded-none bg-black border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14] hover:text-black font-bold uppercase tracking-widest text-xs" disabled={busy}>
                {busy ? "Salvando..." : "Salvar"}
              </Button>
            </form>
            </div>
          </DialogContent>
        </Dialog>
        )}
        </div>
      </div>

      {forms.length === 0 ? (
        <Card className={cyberAtivo ? "relative z-10 bg-white/[0.02] border-white/10 text-white" : ""}>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText className={`h-10 w-10 ${cyberAtivo ? "text-[#39FF14]" : "text-muted-foreground"}`} />
            <p className={cyberAtivo ? "text-white/60" : "text-muted-foreground"}>Nenhuma prestação ainda. Crie a primeira!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative z-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(() => {
            const baseFiltered = forms.filter((f) =>
              ((f.tipo || "verba_cury") === tipoAtivo) &&
              (filtroMes === "todos" || String(f.mes_referencia ?? "") === filtroMes) &&
              (filtroAno === "todos" || String(f.ano_referencia ?? "") === filtroAno) &&
              (filtroDiretor === "todos" || (() => {
                if ((f.diretor ?? "") === filtroDiretor) return true;
                const supName = (f.superintendente ?? "").trim();
                if (!supName) return false;
                const dir = diretores.find((d) => d.nome === filtroDiretor);
                if (!dir) return false;
                return superintendentes.some((s) => s.nome === supName && s.diretor_id === dir.id);
              })()) &&
              (filtroSup === "todos" || (f.superintendente ?? "") === filtroSup) &&
              (filtroGerente === "todos" || (gerentesMap[f.id] || []).includes(filtroGerente))
            );
            type Col = { key: string; label: string; headerBg: string; border: string; title: string; badge: string; items: typeof forms };
            let cols: Col[];
            if (tipoAtivo === "contratacao") {
              const groups = new Map<string, { mes: number; ano: number; items: typeof forms }>();
              baseFiltered.forEach((f) => {
                const m = f.mes_referencia ?? 0;
                const a = f.ano_referencia ?? 0;
                const key = `${a}-${String(m).padStart(2, "0")}`;
                if (!groups.has(key)) groups.set(key, { mes: m, ano: a, items: [] });
                groups.get(key)!.items.push(f);
              });
              cols = Array.from(groups.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([key, g]) => ({
                  key,
                  label: g.mes ? `${MESES[g.mes - 1]}/${g.ano}` : "Sem mês",
                  headerBg: "bg-black/40",
                  border: "border-[#39FF14]/30",
                  title: "text-[#39FF14]",
                  badge: "bg-[#39FF14] text-black",
                  items: g.items,
                }));
              if (cols.length === 0) {
                cols = [{ key: "vazio", label: "Sem lançamentos", headerBg: "bg-muted/20", border: "border-muted", title: "text-muted-foreground", badge: "bg-muted text-foreground", items: [] }];
              }
            } else {
              const source = cyberAtivo ? CYBER_COLUMNS : COLUMNS;
              cols = source.map((c) => ({ ...c, items: baseFiltered.filter((f) => (f.status || "editando") === c.key) }));
            }
            return cols.map((col) => {
              const items = col.items;
              const cyber = cyberAtivo;
            return (
              <div key={col.key} className={`relative border ${col.headerBg} ${col.border} p-3 ${cyber ? "backdrop-blur-md" : ""}`}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-xs font-bold uppercase tracking-widest ${col.title}`}>{col.label}</h2>
                  <span className={`px-2 py-0.5 text-xs font-medium ${col.badge}`}>{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 && (
                    <div className={`border border-dashed p-4 text-center text-xs ${cyber ? "border-white/10 bg-white/[0.02] text-white/40" : "bg-background/40 text-muted-foreground"}`}>
                      Nenhum
                    </div>
                  )}
                  {items.map((f) => (
                  <Card
                    key={f.id}
                    className={`relative transition ${
                      f.tipo === "verba_cury"
                        ? "bg-white/10 border-[#1e40af]/60 text-white hover:border-[#1e40af] backdrop-blur-md rounded-none"
                        : f.tipo === "gastos_pessoais"
                        ? "bg-black/40 border-[#1e40af]/60 text-white hover:border-[#1e40af] backdrop-blur-md rounded-none"
                        : f.tipo === "contratacao"
                        ? "bg-black/40 border-[#1e40af]/60 text-white hover:border-[#1e40af] backdrop-blur-md rounded-none"
                        : f.tipo === "planejamento"
                        ? "bg-black/40 border-[#1e40af]/60 text-white hover:border-[#1e40af] backdrop-blur-md rounded-none"
                        : cyber
                        ? "bg-black/40 border-white/10 text-white hover:border-[#39FF14]/60 backdrop-blur-md rounded-none"
                        : "hover:border-primary hover:shadow-sm"
                    }`}
                  >
                      {(((f.status || "editando") === "editando") || isAdmin) && (canEdit || isAdmin) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`absolute right-2 top-2 z-10 h-7 w-7 hover:text-destructive ${cyber ? "text-white/40 hover:bg-white/5" : "text-muted-foreground"}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className={cyber ? "rounded-none border border-[#39FF14]/40 bg-black/90 backdrop-blur-md text-gray-300" : undefined}>
                          <AlertDialogHeader>
                            <AlertDialogTitle className={cyber ? "text-[#39FF14] uppercase tracking-[0.25em] text-sm" : undefined}>
                              {cyber ? (tipoAtivo === "planejamento" ? "// EXCLUIR PLANEJAMENTO?" : tipoAtivo === "gastos_pessoais" ? "// EXCLUIR GASTOS PESSOAIS?" : "// EXCLUIR VERBA CURY?") : "Excluir prestação?"}
                            </AlertDialogTitle>
                            <AlertDialogDescription className={cyber ? "text-gray-400 uppercase tracking-widest text-[10px]" : undefined}>
                              Esta ação não pode ser desfeita. Todos os lançamentos vinculados também serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className={cyber ? "rounded-none border border-[#39FF14]/30 bg-transparent text-gray-400 hover:bg-[#39FF14]/10 hover:text-[#39FF14] uppercase tracking-widest text-[10px]" : undefined}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className={cyber ? "rounded-none bg-transparent border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14] hover:text-black font-bold uppercase tracking-widest text-[10px]" : undefined}
                              onClick={async () => {
                                const { data: lancs } = await supabase.from("lancamentos").select("*").eq("formulario_id", f.id);
                                const { data: forms } = await supabase.from("formularios").select("*").eq("id", f.id);
                                await supabase.from("lancamentos").delete().eq("formulario_id", f.id);
                                const { error } = await supabase.from("formularios").delete().eq("id", f.id);
                                if (error) toast.error(error.message);
                                else {
                                  pushUndo(`Prestação "${f.nome || "sem nome"}" excluída`, [
                                    { table: "formularios", rows: forms || [] },
                                    { table: "lancamentos", rows: lancs || [] },
                                  ]);
                                  load();
                                }
                              }}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      )}
                      <Link to="/formularios/$id" params={{ id: f.id }}>
                        <CardHeader className="p-4 pb-2">
                          <div className="pr-8">
                            <CardTitle className={`text-sm ${cyber ? "text-white font-bold uppercase tracking-tight" : ""}`}>
                              {f.tipo === "gastos_pessoais" || f.tipo === "contratacao"
                                ? (f.responsavel || usuarios.find((u) => u.id === (f as any).usuario_id)?.nome || f.nome || fmtDateTime(f.created_at))
                                : (f.nome || fmtDateTime(f.created_at))}
                            </CardTitle>
                          </div>
                          <p className={`text-[10px] uppercase tracking-[0.2em] ${f.tipo === "gastos_pessoais" ? "text-[#39FF14] font-bold" : cyber ? "text-[#39FF14]/80" : "text-muted-foreground/80"}`}>{tipoLabel(f.tipo)}</p>
                          {f.mes_referencia && f.ano_referencia && (
                            <p className={`text-xs ${cyber ? "text-white/40" : "text-muted-foreground"}`}>
                              Ref: {MESES[f.mes_referencia - 1]}/{f.ano_referencia}
                            </p>
                          )}
                        </CardHeader>
                        <CardContent className={`space-y-1 p-4 pt-0 text-xs ${cyber ? "text-white/80" : ""}`}>
                          {f.tipo !== "gastos_pessoais" && f.diretor && <div className="flex justify-between"><span className={cyber ? "text-white/40" : "text-muted-foreground"}>Diretor</span><span className="truncate pl-2">{f.diretor}</span></div>}
                          {f.tipo !== "gastos_pessoais" && f.superintendente && <div className="flex justify-between"><span className={cyber ? "text-white/40" : "text-muted-foreground"}>Superint.</span><span className="truncate pl-2">{f.superintendente}</span></div>}
                          {f.tipo !== "gastos_pessoais" && f.responsavel && <div className="flex justify-between"><span className={cyber ? "text-white/40" : "text-muted-foreground"}>Responsável</span><span className="truncate pl-2">{f.responsavel}</span></div>}
                          {f.tipo === "gastos_pessoais" && (() => {
                            const g = gastosMap[f.id] || { gv: 0, mn: 0, total: 0 };
                            return (
                              <>
                                <div className={`mt-2 flex justify-between border-t pt-2 ${cyber ? "border-white/10" : ""}`}><span className="text-white/40">Gerar Venda</span><span className="text-[#39FF14]">{brl(g.gv)}</span></div>
                                <div className="flex justify-between"><span className="text-white/40">Manutenção</span><span className="text-blue-700">{brl(g.mn)}</span></div>
                                <div className="flex justify-between font-semibold"><span>Total</span><span>{brl(g.total)}</span></div>
                              </>
                            );
                          })()}
                          {f.tipo === "verba_cury" && (() => {
                            const total = Number(f.valor_agilitas) + Number(f.valor_marketing);
                            const saldoF = disponivelMap[f.id] ?? total;
                            const utilizado = total - saldoF;
                            return (<>
                              <div className={`mt-2 flex justify-between border-t pt-2 ${cyber ? "border-white/10" : ""}`}><span className={cyber ? "text-white/40" : "text-muted-foreground"}>Verba Agilitas</span><span>{brl(Number(f.valor_agilitas) || 0)}</span></div>
                              <div className="flex justify-between"><span className={cyber ? "text-white/40" : "text-muted-foreground"}>Verba Marketing</span><span>{brl(Number(f.valor_marketing) || 0)}</span></div>
                              <div className="flex justify-between font-semibold"><span>Total</span><span>{brl(total)}</span></div>
                              <div className="flex justify-between"><span className={cyber ? "text-white/40" : "text-muted-foreground"}>Utilizado</span><span className={cyber ? "text-orange-400" : "text-orange-600"}>{brl(utilizado)}</span></div>
                              <div className="flex justify-between font-semibold">
                                <span>Saldo</span>
                                <span className={saldoF < 0 ? "text-destructive" : (cyber ? "text-[#39FF14]" : "text-emerald-600")}>{brl(saldoF)}</span>
                              </div>
                            </>);
                          })()}
                          {f.tipo === "planejamento" && (() => {
                            const p = planMap[f.id];
                            const ownerNome = usuarios.find((u) => u.id === (f as any).usuario_id)?.nome || "—";
                            return (
                              <>
                                <div className="flex justify-between"><span className="text-muted-foreground">Superint.</span><span className="truncate pl-2">{ownerNome}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Meta Sup.</span><span className="pl-2">{(p?.metaSup || 0).toLocaleString("pt-BR")}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Verba Total</span><span className="pl-2">{brl(p?.verbaTotal || 0)}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Corretores Acelera</span><span className="pl-2">{p?.corretoresAcelera || 0}</span></div>
                              </>
                            );
                          })()}
                          {f.tipo === "contratacao" && (() => {
                            const c = contratacaoMap[f.id] || { candidatos: 0, contratados: 0, total: 0 };
                            return (
                              <div className={`mt-2 flex justify-between border-t pt-2 ${cyber ? "border-[#39FF14]/30" : ""}`}>
                                <span className={cyber ? "text-white/40" : "text-muted-foreground"}>Total</span>
                                <span className={cyber ? "text-[#39FF14] font-bold" : "font-semibold"}>{c.total}</span>
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Link>
                    </Card>
                  ))}
                </div>
              </div>
            );
            });
          })()}
        </div>
      )}
    </div>
  );
}

const COLUMNS: { key: string; label: string; headerBg: string; border: string; title: string; badge: string }[] = [
  // Em aberto → accent (#004AAD)
  { key: "editando", label: "Em aberto", headerBg: "bg-[#004AAD]/5", border: "border-[#004AAD]/30", title: "text-[#004AAD]", badge: "bg-[#004AAD] text-white" },
  // Finalizado → primary (#D11877)
  { key: "finalizado", label: "Finalizado", headerBg: "bg-[#D11877]/5", border: "border-[#D11877]/30", title: "text-[#D11877]", badge: "bg-[#D11877] text-white" },
  // Validado → secondary (#0D7A38)
  { key: "validado", label: "Validado", headerBg: "bg-[#0D7A38]/5", border: "border-[#0D7A38]/30", title: "text-[#0D7A38]", badge: "bg-[#0D7A38] text-white" },
  // Reprovado → vermelho
  { key: "reprovado", label: "Reprovado", headerBg: "bg-red-50 dark:bg-red-950/30", border: "border-red-300", title: "text-red-700", badge: "bg-red-600 text-white" },
];

const CYBER_COLUMNS: typeof COLUMNS = [
  { key: "editando", label: "Em aberto", headerBg: "bg-black/40", border: "border-[#39FF14]/40", title: "text-[#ff1493]", badge: "bg-white/10 text-white border border-white/20" },
  { key: "finalizado", label: "Finalizado", headerBg: "bg-black/40", border: "border-[#39FF14]/40", title: "text-[#ff1493]", badge: "bg-white/10 text-white border border-white/20" },
  { key: "validado", label: "Validado", headerBg: "bg-black/40", border: "border-[#39FF14]/40", title: "text-[#ff1493]", badge: "bg-white/10 text-white border border-white/20" },
  { key: "reprovado", label: "Reprovado", headerBg: "bg-black/40", border: "border-[#39FF14]/40", title: "text-[#ff1493]", badge: "bg-white/10 text-white border border-white/20" },
];
