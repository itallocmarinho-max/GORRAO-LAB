import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { TIPOS_FORMULARIO, TIPOS_GASTO, type TipoFormulario, tipoLabel, destinacaoFromTipoGasto } from "@/lib/form-types";
import { useHierarquia } from "@/hooks/useHierarquia";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { HeaderNavigationMenu } from "@/components/HeaderNavigationMenu";



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
  tipo_verba?: string | null;
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
  const [gastosPorTipoMap, setGastosPorTipoMap] = useState<Record<string, Record<string, { gv: number; mn: number; total: number }>>>({});
  const [contratacaoMap, setContratacaoMap] = useState<Record<string, { candidatos: number; contratados: number; total: number }>>({});
  const [open, setOpen] = useState(false);
  const tipoAtivo = (search.tipo as TipoFormulario | undefined) || "verba_cury";
  const [filtroMes, setFiltroMes] = useState<string>("todos");
  const [filtroAno, setFiltroAno] = useState<string>("todos");
  const [filtroSup, setFiltroSup] = useState<string>("todos");
  const [filtroGerente, setFiltroGerente] = useState<string>("todos");
  const [filtroDiretor, setFiltroDiretor] = useState<string>("todos");
  const [filtroTipoGasto, setFiltroTipoGasto] = useState<string>("todos");
  const [filtroDestinacaoGasto, setFiltroDestinacaoGasto] = useState<"todos" | "gerar_venda" | "manutencao">("todos");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const filtrosRef = useRef<HTMLDivElement>(null);
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
  const [tipoVerba, setTipoVerba] = useState<"cury" | "campanha_estoque">("cury");
  const [busy, setBusy] = useState(false);
  const [responsavelSelecionado, setResponsavelSelecionado] = useState<{
    nome: string;
    formularios: Form[];
  } | null>(null);

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
      const gastosPorTipoAgg: Record<string, Record<string, { gv: number; mn: number; total: number }>> = {};
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
          if (l.tipo_gasto) {
            const porFormulario = (gastosPorTipoAgg[l.formulario_id] ||= {});
            const porTipo = (porFormulario[l.tipo_gasto] ||= { gv: 0, mn: 0, total: 0 });
            if (dest === "Gerar Venda") porTipo.gv += v; else porTipo.mn += v;
            porTipo.total += v;
          }
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
      setGastosPorTipoMap(gastosPorTipoAgg);
      setContratacaoMap(contratacaoAgg);
    } else {
      setDisponivelMap({});
      setGerentesMap({});
      setPlanMap({});
      setGastosMap({});
      setGastosPorTipoMap({});
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
    setFiltroMes("todos"); setFiltroAno("todos"); setFiltroDiretor("todos"); setFiltroSup("todos"); setFiltroGerente("todos"); setFiltroTipoGasto("todos"); setFiltroDestinacaoGasto("todos");
    setFiltrosAbertos(false);
  }, [tipoAtivo]);

  useEffect(() => {
    if (!filtrosAbertos) return;
    const fecharAoClicarFora = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (filtrosRef.current?.contains(target)) return;
      if (target.closest('[role="listbox"]')) return;
      setFiltrosAbertos(false);
    };
    document.addEventListener("pointerdown", fecharAoClicarFora);
    return () => document.removeEventListener("pointerdown", fecharAoClicarFora);
  }, [filtrosAbertos]);

  const total = (Number(agilitas) || 0) + (Number(marketing) || 0);

  const gastosDoFormulario = (formularioId: string) => {
    const gastos = filtroTipoGasto === "todos"
      ? (gastosMap[formularioId] || { gv: 0, mn: 0, total: 0 })
      : (gastosPorTipoMap[formularioId]?.[filtroTipoGasto] || { gv: 0, mn: 0, total: 0 });
    if (filtroDestinacaoGasto === "gerar_venda") return { gv: gastos.gv, mn: 0, total: gastos.gv };
    if (filtroDestinacaoGasto === "manutencao") return { gv: 0, mn: gastos.mn, total: gastos.mn };
    return gastos;
  };

  const formsFiltrados = forms.filter((f) =>
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
    (filtroGerente === "todos" || (gerentesMap[f.id] || []).includes(filtroGerente)) &&
    (tipoAtivo !== "gastos_pessoais" || filtroTipoGasto === "todos" || Boolean(gastosPorTipoMap[f.id]?.[filtroTipoGasto])) &&
    (tipoAtivo !== "gastos_pessoais" || filtroDestinacaoGasto === "todos" || gastosDoFormulario(f.id).total !== 0)
  );

  const resumoVerbaValidada = formsFiltrados
    .filter((f) => (f.status || "editando") === "validado")
    .reduce(
      (acc, f) => {
        acc.agilitas += Number(f.valor_agilitas) || 0;
        acc.marketing += Number(f.valor_marketing) || 0;
        acc.quantidade += 1;
        return acc;
      },
      { agilitas: 0, marketing: 0, quantidade: 0 },
    );

  const resumoGastosValidado = formsFiltrados
    .filter((formulario) => (formulario.status || "editando") === "validado")
    .reduce(
      (acumulado, formulario) => {
        const gastos = gastosDoFormulario(formulario.id);
        acumulado.gerarVenda += gastos.gv;
        acumulado.manutencao += gastos.mn;
        acumulado.total += gastos.total;
        acumulado.quantidade += 1;
        return acumulado;
      },
      { gerarVenda: 0, manutencao: 0, total: 0, quantidade: 0 },
    );

  const verbasPorResponsavel = Array.from(
    formsFiltrados.reduce((grupos, formulario) => {
      const nomeResponsavel = formulario.nome
        || usuarios.find((usuario) => usuario.id === formulario.usuario_id)?.nome
        || formulario.superintendente
        || formulario.diretor
        || "Sem responsável";
      const chave = formulario.usuario_id || nomeResponsavel;
      const grupo = grupos.get(chave) || { chave, nome: nomeResponsavel, formularios: [] as Form[] };
      grupo.formularios.push(formulario);
      grupos.set(chave, grupo);
      return grupos;
    }, new Map<string, { chave: string; nome: string; formularios: Form[] }>()),
  ).map(([, grupo]) => grupo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

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
    if (isVerba) {
      const { data: existente, error: duplicateError } = await supabase
        .from("formularios")
        .select("id")
        .eq("usuario_id", effectiveOwnerId)
        .eq("tipo", "verba_cury")
        .eq("mes_referencia", Number(mes))
        .eq("ano_referencia", Number(ano))
        .eq("tipo_verba", tipoVerba)
        .limit(1);
      if (duplicateError) {
        setBusy(false);
        return toast.error(duplicateError.message);
      }
      if (existente?.length) {
        setBusy(false);
        return toast.error(
          `Já existe uma verba ${tipoVerba === "cury" ? "Cury" : "Campanha de Estoque"} para este responsável em ${MESES[Number(mes) - 1]}/${ano}.`,
        );
      }
    }
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
      tipo_verba: isVerba ? tipoVerba : "cury",
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
    if (error) {
      if (error.code === "23505" && isVerba) {
        return toast.error(
          `Já existe uma verba ${tipoVerba === "cury" ? "Cury" : "Campanha de Estoque"} para este responsável no mês e ano selecionados.`,
        );
      }
      return toast.error(error.message);
    }
    if (!data || data.length === 0) return toast.error("Não foi possível criar o formulário (verifique permissões).");
    setOpen(false);
    setNome(""); setDiretor(""); setSuperintendente(""); setResponsavel("");
    setAgilitas(""); setMarketing(""); setTipoVerba("cury"); setParaOutro(false); setSemana("");
    navigate({ to: "/formularios/$id", params: { id: data[0].id } });
  };

  return (
    <div
      className={
        cyberAtivo
          ? "verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 pb-10 pt-0 space-y-8"
          : "relative space-y-6"
      }
    >
      {cyberAtivo && <CyberBackdrop />}
      {cyberAtivo && (
        <header className="sticky top-0 z-40 -mx-6 mb-8 grid h-16 grid-cols-[1fr_auto_1fr] items-center border-b border-[#39FF14]/25 bg-black/90 px-6 backdrop-blur-xl">
          <div className="flex h-full items-center gap-2 self-center justify-self-start text-[11px] font-bold uppercase tracking-[0.28em] text-white/90">
            <span className="flex h-7 w-7 items-center justify-center border border-[#39FF14] text-[11px] font-black text-[#39FF14]">G</span>
            <span>GORRÃO <span className="text-[#39FF14]">/ /</span> LAB</span>
          </div>
          <h1 className="self-center justify-self-center text-xs font-bold leading-none uppercase tracking-[0.35em] text-[#39FF14]">
            {tipoLabel(tipoAtivo).replace(/^\/\/\s*/, "")}
          </h1>
          <div className="flex h-full items-center self-center justify-self-end">
            <HeaderNavigationMenu />
          </div>
        </header>
      )}
      <div className={`relative z-30 ${tipoAtivo === "planejamento" || tipoAtivo === "gastos_pessoais" || cyberAtivo ? "flex flex-col gap-4" : "flex items-center justify-between"}`}>
        <div>
          {!cyberAtivo && (
            <h1 className="text-2xl font-semibold text-primary whitespace-nowrap">{tipoLabel(tipoAtivo)}</h1>
          )}
          {tipoAtivo !== "planejamento" && tipoAtivo !== "gastos_pessoais" && tipoAtivo !== "verba_cury" && tipoAtivo !== "contratacao" && (
            <p className="text-sm text-muted-foreground">{TIPOS_FORMULARIO.find((t) => t.value === tipoAtivo)?.descricao}</p>
          )}
        </div>
        <div className={cyberAtivo ? "flex w-full items-center justify-end gap-2" : "flex items-center gap-2"}>
        {cyberAtivo && (
          <div ref={filtrosRef} className="relative">
            <button
              type="button"
              aria-expanded={filtrosAbertos}
              aria-controls="dashboard-filtros"
              onClick={() => setFiltrosAbertos((aberto) => !aberto)}
              className="group flex h-9 items-center gap-2 border border-[#39FF14]/40 bg-black/60 px-3 text-[10px] font-bold uppercase tracking-[0.25em] text-[#39FF14] transition-all hover:border-[#39FF14] hover:bg-[#39FF14]/10"
            >
              <span className="relative block h-4 w-6 shrink-0" aria-hidden>
                <span className={`absolute top-1/2 h-[2px] w-3.5 bg-current shadow-[0_0_5px_currentColor] transition-all duration-300 ${filtrosAbertos ? "left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" : "left-[22%] -translate-x-1/2 -translate-y-1/2 -rotate-[65deg]"}`} />
                <span className={`absolute top-1/2 h-[2px] w-3.5 bg-current shadow-[0_0_5px_currentColor] transition-all duration-300 ${filtrosAbertos ? "left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" : "left-[78%] -translate-x-1/2 -translate-y-1/2 -rotate-[65deg]"}`} />
              </span>
              FILTRO
            </button>
            <div
              id="dashboard-filtros"
              className={`absolute right-0 top-[calc(100%+10px)] z-50 w-72 origin-top-right border border-[#39FF14]/35 bg-black/95 p-4 shadow-[0_0_35px_rgba(57,255,20,0.14)] backdrop-blur-xl transition-all duration-200 ${filtrosAbertos ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}
            >
              <div className="mb-3 border-b border-[#39FF14]/20 pb-2 text-[9px] uppercase tracking-[0.3em] text-white/40">// FILTRAR REGISTROS</div>
              <div className="space-y-3">
                {[
                  <Select key="mes" value={filtroMes} onValueChange={setFiltroMes}><SelectTrigger><SelectValue placeholder="MÊS" /></SelectTrigger><SelectContent><SelectItem value="todos">TODOS OS MESES</SelectItem>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m.toUpperCase()}</SelectItem>)}</SelectContent></Select>,
                  <Select key="ano" value={filtroAno} onValueChange={setFiltroAno}><SelectTrigger><SelectValue placeholder="ANO" /></SelectTrigger><SelectContent><SelectItem value="todos">TODOS OS ANOS</SelectItem>{Array.from(new Set(forms.filter((f) => f.tipo === tipoAtivo).map((f) => f.ano_referencia).filter(Boolean) as number[])).sort((a, b) => b - a).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>,
                  <Select key="diretor" value={filtroDiretor} onValueChange={(v) => { setFiltroDiretor(v); setFiltroSup("todos"); setFiltroGerente("todos"); }}><SelectTrigger><SelectValue placeholder="DIRETOR" /></SelectTrigger><SelectContent><SelectItem value="todos">TODOS OS DIRETORES</SelectItem>{diretores.map((d) => <SelectItem key={d.id} value={d.nome}>{d.nome.toUpperCase()}</SelectItem>)}</SelectContent></Select>,
                  <Select key="sup" value={filtroSup} onValueChange={(v) => { setFiltroSup(v); setFiltroGerente("todos"); }}><SelectTrigger><SelectValue placeholder="SUPERINTENDENTE" /></SelectTrigger><SelectContent><SelectItem value="todos">TODOS OS SUP.</SelectItem>{supsByDiretorNome(filtroDiretor).map((s) => <SelectItem key={s.id} value={s.nome}>{s.nome.toUpperCase()}</SelectItem>)}</SelectContent></Select>,
                  <Select key="gerente" value={filtroGerente} onValueChange={setFiltroGerente}><SelectTrigger><SelectValue placeholder="GERENTE" /></SelectTrigger><SelectContent><SelectItem value="todos">TODOS OS GERENTES</SelectItem>{gerentesByDiretorSup(filtroDiretor, filtroSup).map((g) => <SelectItem key={g.id} value={g.nome}>{g.nome.toUpperCase()}</SelectItem>)}</SelectContent></Select>,
                  ...(tipoAtivo === "gastos_pessoais" ? [
                    <Select key="tipo-gasto" value={filtroTipoGasto} onValueChange={setFiltroTipoGasto}>
                      <SelectTrigger><SelectValue placeholder="TIPO DE GASTO" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">TODOS OS TIPOS DE GASTO</SelectItem>
                        {TIPOS_GASTO.map((tipoGasto) => <SelectItem key={tipoGasto} value={tipoGasto}>{tipoGasto.toUpperCase()}</SelectItem>)}
                      </SelectContent>
                    </Select>,
                    <Select key="destinacao-gasto" value={filtroDestinacaoGasto} onValueChange={(valor) => setFiltroDestinacaoGasto(valor as "todos" | "gerar_venda" | "manutencao")}>
                      <SelectTrigger><SelectValue placeholder="DESTINAÇÃO" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">TODAS AS DESTINAÇÕES</SelectItem>
                        <SelectItem value="gerar_venda">GERAR VENDA</SelectItem>
                        <SelectItem value="manutencao">MANUTENÇÃO</SelectItem>
                      </SelectContent>
                    </Select>,
                  ] : []),
                ].map((controle, index) => (
                  <div key={index} style={{ transitionDelay: filtrosAbertos ? `${index * 45}ms` : "0ms" }} className={`transition-all duration-300 [&_[role=combobox]]:h-9 [&_[role=combobox]]:w-full [&_[role=combobox]]:border-[#39FF14]/25 [&_[role=combobox]]:text-[9px] [&_[role=combobox]]:tracking-[0.18em] ${filtrosAbertos ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}>
                    {controle}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
              {tipo === "verba_cury" && (
                <div>
                  <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Tipo de verba</Label>
                  <Select value={tipoVerba} onValueChange={(value) => setTipoVerba(value as "cury" | "campanha_estoque")}>
                    <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 text-gray-300 uppercase tracking-widest text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cury">CURY</SelectItem>
                      <SelectItem value="campanha_estoque">CAMPANHA DE ESTOQUE</SelectItem>
                    </SelectContent>
                  </Select>
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

      {tipoAtivo === "verba_cury" && (
        <section className="relative z-10 border border-[#39FF14]/25 bg-black/55 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">/ / RESUMO VALIDADO</h2>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {resumoVerbaValidada.quantidade} {resumoVerbaValidada.quantidade === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">Total verba Agilitas</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">{brl(resumoVerbaValidada.agilitas)}</div>
            </div>
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">Total Marketing</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">{brl(resumoVerbaValidada.marketing)}</div>
            </div>
            <div className="border border-[#39FF14]/35 bg-[#39FF14]/[0.045] p-3 shadow-[inset_0_0_20px_rgba(57,255,20,0.035)]">
              <div className="text-[9px] uppercase tracking-[0.22em] text-[#39FF14]/70">Total verba</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#39FF14]">
                {brl(resumoVerbaValidada.agilitas + resumoVerbaValidada.marketing)}
              </div>
            </div>
          </div>
        </section>
      )}

      {tipoAtivo === "gastos_pessoais" && (
        <section className="relative z-10 border border-[#39FF14]/25 bg-black/55 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">/ / RESUMO VALIDADO</h2>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {resumoGastosValidado.quantidade} {resumoGastosValidado.quantidade === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">Total Gerar Venda</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">{brl(resumoGastosValidado.gerarVenda)}</div>
            </div>
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">Total Manutenção</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">{brl(resumoGastosValidado.manutencao)}</div>
            </div>
            <div className="border border-[#39FF14]/35 bg-[#39FF14]/[0.045] p-3 shadow-[inset_0_0_20px_rgba(57,255,20,0.035)]">
              <div className="text-[9px] uppercase tracking-[0.22em] text-[#39FF14]/70">Total de gastos</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#39FF14]">{brl(resumoGastosValidado.total)}</div>
            </div>
          </div>
        </section>
      )}

      {formsFiltrados.length === 0 ? (
        <Card className={cyberAtivo ? "relative z-10 bg-white/[0.02] border-white/10 text-white" : ""}>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText className={`h-10 w-10 ${cyberAtivo ? "text-[#39FF14]" : "text-muted-foreground"}`} />
            <p className={cyberAtivo ? "text-white/60" : "text-muted-foreground"}>Nenhuma prestação ainda. Crie a primeira!</p>
          </CardContent>
        </Card>
      ) : tipoAtivo === "verba_cury" ? (
        <section className="relative z-10">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">/ / VERBAS POR RESPONSÁVEL</h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Selecione um cartão para escolher a competência</p>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {verbasPorResponsavel.length} {verbasPorResponsavel.length === 1 ? "responsável" : "responsáveis"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {verbasPorResponsavel.map((grupo) => {
              const valorTotal = grupo.formularios.reduce(
                (soma, formulario) => soma + (Number(formulario.valor_agilitas) || 0) + (Number(formulario.valor_marketing) || 0),
                0,
              );
              const totalMeses = new Set(
                grupo.formularios.map((formulario) => `${formulario.ano_referencia || 0}-${formulario.mes_referencia || 0}`),
              ).size;
              const mediaMensal = totalMeses > 0 ? valorTotal / totalMeses : 0;

              return (
                <button
                  key={grupo.chave}
                  type="button"
                  onClick={() => setResponsavelSelecionado({ nome: grupo.nome, formularios: grupo.formularios })}
                  className="group border border-[#39FF14]/30 bg-black/55 p-4 text-left backdrop-blur-md transition hover:border-[#39FF14] hover:bg-[#39FF14]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
                >
                  <div className="border-b border-white/10 pb-3">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">Responsável</div>
                    <h3 className="mt-1 text-sm font-bold uppercase tracking-wider text-[#39FF14]">{grupo.nome}</h3>
                  </div>
                  <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.14em]">
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total de meses</span>
                      <span className="font-mono text-sm font-bold text-white">{totalMeses}</span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total de verba</span>
                      <span className="font-mono text-sm font-bold text-white">{brl(valorTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-2">
                      <span className="text-[#39FF14]/65">Média / mês</span>
                      <span className="font-mono text-sm font-bold text-[#39FF14]">{brl(mediaMensal)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : tipoAtivo === "gastos_pessoais" ? (
        <section className="relative z-10">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">/ / GASTOS POR SUPERINTENDENTE</h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Selecione um cartão para escolher o mês</p>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {verbasPorResponsavel.length} {verbasPorResponsavel.length === 1 ? "superintendente" : "superintendentes"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {verbasPorResponsavel.map((grupo) => {
              const totais = grupo.formularios.reduce(
                (acumulado, formulario) => {
                  const gastos = gastosDoFormulario(formulario.id);
                  acumulado.gerarVenda += gastos.gv;
                  acumulado.manutencao += gastos.mn;
                  acumulado.total += gastos.total;
                  return acumulado;
                },
                { gerarVenda: 0, manutencao: 0, total: 0 },
              );
              const totalMeses = new Set(
                grupo.formularios.map((formulario) => `${formulario.ano_referencia || 0}-${formulario.mes_referencia || 0}`),
              ).size;
              const mediaMensal = totalMeses > 0 ? totais.total / totalMeses : 0;

              return (
                <button
                  key={grupo.chave}
                  type="button"
                  onClick={() => setResponsavelSelecionado({ nome: grupo.nome, formularios: grupo.formularios })}
                  className="group border border-[#39FF14]/30 bg-black/55 p-4 text-left backdrop-blur-md transition hover:border-[#39FF14] hover:bg-[#39FF14]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
                >
                  <div className="border-b border-white/10 pb-3">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">Superintendente</div>
                    <h3 className="mt-1 text-sm font-bold uppercase tracking-wider text-[#39FF14]">{grupo.nome}</h3>
                  </div>
                  <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.14em]">
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Gerar Venda</span>
                      <span className="font-mono text-sm font-bold text-white">{brl(totais.gerarVenda)}</span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Manutenção</span>
                      <span className="font-mono text-sm font-bold text-white">{brl(totais.manutencao)}</span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total</span>
                      <span className="font-mono text-sm font-bold text-white">{brl(totais.total)}</span>
                    </div>
                    <div className="flex items-center justify-between border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-2">
                      <span className="text-[#39FF14]/65">Média / mês</span>
                      <span className="font-mono text-sm font-bold text-[#39FF14]">{brl(mediaMensal)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="relative z-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(() => {
            const baseFiltered = formsFiltrados;
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
                          {f.tipo === "verba_cury" && (
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">
                              {f.tipo_verba === "campanha_estoque" ? "Campanha de Estoque" : "Cury"}
                            </p>
                          )}
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

      <Dialog open={Boolean(responsavelSelecionado)} onOpenChange={(aberto) => !aberto && setResponsavelSelecionado(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-none border border-[#39FF14]/40 bg-black/95 text-white backdrop-blur-xl sm:max-w-xl">
          <DialogHeader className="border-b border-[#39FF14]/20 pb-4">
            <DialogTitle className="text-sm font-bold uppercase tracking-[0.22em] text-[#39FF14]">/ / ESCOLHA O MÊS</DialogTitle>
            <p className="text-xs uppercase tracking-[0.14em] text-white/50">{responsavelSelecionado?.nome}</p>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {responsavelSelecionado?.formularios
              .slice()
              .sort((a, b) => ((b.ano_referencia || 0) * 100 + (b.mes_referencia || 0)) - ((a.ano_referencia || 0) * 100 + (a.mes_referencia || 0)))
              .map((formulario) => {
                const status = formulario.status || "editando";
                const valor = tipoAtivo === "gastos_pessoais"
                  ? gastosDoFormulario(formulario.id).total
                  : (Number(formulario.valor_agilitas) || 0) + (Number(formulario.valor_marketing) || 0);
                return (
                  <div key={formulario.id} className="flex border border-white/10 bg-white/[0.025] transition hover:border-[#39FF14]/70">
                    <button
                      type="button"
                      onClick={() => {
                        setResponsavelSelecionado(null);
                        navigate({ to: "/formularios/$id", params: { id: formulario.id } });
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 p-3 text-left transition hover:bg-[#39FF14]/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
                    >
                      <div>
                        <div className="text-sm font-bold uppercase tracking-wider text-white">
                          {formulario.mes_referencia ? MESES[formulario.mes_referencia - 1] : "Sem mês"}/{formulario.ano_referencia || "—"}
                        </div>
                        {tipoAtivo === "verba_cury" && (
                          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
                            {formulario.tipo_verba === "campanha_estoque" ? "Campanha de Estoque" : "Cury"}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-bold text-[#39FF14]">{brl(valor)}</div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-white/45">{status === "editando" ? "Em aberto" : status}</div>
                      </div>
                    </button>
                    {isAdmin && tipoAtivo === "verba_cury" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Excluir verba de ${formulario.mes_referencia ? MESES[formulario.mes_referencia - 1] : "mês não informado"}`}
                            className="flex w-12 shrink-0 items-center justify-center border-l border-red-500/25 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-none border border-red-500/40 bg-black/95 text-white backdrop-blur-xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-sm uppercase tracking-[0.2em] text-red-400">/ / EXCLUIR VERBA CURY?</AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-white/50">
                              A verba de {formulario.mes_referencia ? MESES[formulario.mes_referencia - 1] : "mês não informado"}/{formulario.ano_referencia || "—"} e todos os lançamentos vinculados serão removidos. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-none border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-none border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-black"
                              onClick={async () => {
                                const { data: lancamentosExcluidos } = await supabase.from("lancamentos").select("*").eq("formulario_id", formulario.id);
                                const { data: formulariosExcluidos } = await supabase.from("formularios").select("*").eq("id", formulario.id);
                                const { error: erroLancamentos } = await supabase.from("lancamentos").delete().eq("formulario_id", formulario.id);
                                if (erroLancamentos) return toast.error(erroLancamentos.message);
                                const { error: erroFormulario } = await supabase.from("formularios").delete().eq("id", formulario.id);
                                if (erroFormulario) return toast.error(erroFormulario.message);

                                pushUndo(`Verba de ${formulario.mes_referencia ? MESES[formulario.mes_referencia - 1] : "mês não informado"}/${formulario.ano_referencia || "—"} excluída`, [
                                  { table: "formularios", rows: formulariosExcluidos || [] },
                                  { table: "lancamentos", rows: lancamentosExcluidos || [] },
                                ]);
                                setResponsavelSelecionado(null);
                                toast.success("Verba Cury excluída com sucesso.");
                                await load();
                              }}
                            >
                              Excluir definitivamente
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
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
