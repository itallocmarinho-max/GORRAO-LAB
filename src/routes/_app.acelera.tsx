import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, CheckCircle2 } from "lucide-react";
import { brl, fmtDateTime } from "@/lib/format";
import { StatusBadge } from "@/lib/status";
import { toast } from "sonner";
import { CyberHeading } from "@/components/cyber/CyberHeading";
import { useHierarquia } from "@/hooks/useHierarquia";
import {
  cyberCard,
  cyberCardHover,
  cyberSelectTrigger,
  cyberSelectContent,
  cyberSelectItem,
  cyberBadge,
  cyberBadgeMuted,
  cyberStat,
  cyberStatLabel,
  cyberStatValue,
  cyberEmpty,
  cyberBtn,
  cyberBtnGhost,
} from "@/lib/cyber-ui";

export const Route = createFileRoute("/_app/acelera")({
  head: () => ({
    meta: [
      { title: "Acelera Vendas — DIRETORIA GORRÃO" },
      { name: "description", content: "Acompanhamento de comprovantes do Acelera Vendas, vinculado aos Planejamentos." },
    ],
  }),
  component: AceleraList,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

interface PlanForm {
  id: string;
  nome: string | null;
  superintendente: string | null;
  mes_referencia: number | null;
  ano_referencia: number | null;
  status: string;
  created_at: string;
  usuario_id: string;
  criador_nome?: string | null;
  acelera_finalizado_em: string | null;
}

function AceleraList() {
  const location = useLocation();
  const { user, role, nome: nomeUsuario, canEdit, isDiretor, isRH, vinculadoId } = useAuth();
  const { diretores, superintendentes } = useHierarquia();
  const [forms, setForms] = useState<PlanForm[]>([]);
  const [counts, setCounts] = useState<Record<string, { participantes: number; gerentes: number; investido: number; finalizados: number }>>({});
  const [filtroMes, setFiltroMes] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const [filtroSup, setFiltroSup] = useState("todos");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [supSelecionado, setSupSelecionado] = useState<string | null>(null);
  const filtrosRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fechar = (event: MouseEvent) => { if (filtrosRef.current && !filtrosRef.current.contains(event.target as Node)) setFiltrosAbertos(false); };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, []);

  useEffect(() => {
    (async () => {
      if (!user) return;
      let q = supabase.from("formularios").select("id,nome,superintendente,mes_referencia,ano_referencia,status,created_at,usuario_id,acelera_finalizado_em").eq("tipo", "planejamento").order("created_at", { ascending: false });
      if (role !== "admin") {
        const ownerId = isRH && vinculadoId ? vinculadoId : user.id;
        q = q.eq("usuario_id", ownerId);
      }
      const { data, error } = await q;
      if (error) return toast.error(error.message);
      let list = (data || []) as PlanForm[];
      const userIds = Array.from(new Set(list.map((f) => f.usuario_id).filter(Boolean)));
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id,nome,email").in("id", userIds);
        const map = new Map((profs || []).map((p: any) => [p.id, p.nome || p.email || ""]));
        list = list.map((f) => ({ ...f, criador_nome: map.get(f.usuario_id) ?? null }));
      }
      setForms(list);
      if (list.length) {
        const { data: ls } = await supabase
          .from("lancamentos")
          .select("formulario_id,verba_cury,verba_gerente,verba_superintendente,meta_gerente,nome_recebedor,gerente,acelera_finalizado_em,secao")
          .in("formulario_id", list.map((f) => f.id))
          .eq("secao", "acelera");
        const c: Record<string, { participantes: number; gerentes: number; investido: number; finalizados: number; _gset: Set<string> }> = {};
        (ls || []).forEach((l: any) => {
          const cur = c[l.formulario_id] || { participantes: 0, gerentes: 0, investido: 0, finalizados: 0, _gset: new Set<string>() };
          cur.participantes += 1;
          if (l.gerente) cur._gset.add(String(l.gerente).trim().toLowerCase());
          cur.investido += Number(l.verba_cury || 0) + Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0) + Number(l.meta_gerente || 0);
          if (l.acelera_finalizado_em) cur.finalizados += 1;
          c[l.formulario_id] = cur;
        });
        const out: Record<string, { participantes: number; gerentes: number; investido: number; finalizados: number }> = {};
        Object.keys(c).forEach((k) => { out[k] = { participantes: c[k].participantes, gerentes: c[k]._gset.size, investido: c[k].investido, finalizados: c[k].finalizados }; });
        setCounts(out);
      }
    })();
  }, [user, role, isRH, vinculadoId]);

  const finalizar = async (e: React.MouseEvent, f: PlanForm) => {
    e.preventDefault();
    e.stopPropagation();
    if (role !== "admin") return;
    const c = counts[f.id] || { participantes: 0, finalizados: 0 } as any;
    if (!c.participantes || c.finalizados < c.participantes) {
      if (!confirm("Nem todos os participantes têm os 4 anexos. Finalizar mesmo assim?")) return;
    }
    const { error } = await supabase.from("formularios").update({ acelera_finalizado_em: new Date().toISOString(), acelera_finalizado_por: user!.id }).eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success("Acelera finalizado");
    setForms((prev) => prev.map((x) => x.id === f.id ? { ...x, acelera_finalizado_em: new Date().toISOString() } : x));
  };

  const reabrir = async (e: React.MouseEvent, f: PlanForm) => {
    e.preventDefault();
    e.stopPropagation();
    if (role !== "admin") return;
    const { error } = await supabase.from("formularios").update({ acelera_finalizado_em: null, acelera_finalizado_por: null }).eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success("Acelera reaberto");
    setForms((prev) => prev.map((x) => x.id === f.id ? { ...x, acelera_finalizado_em: null } : x));
  };

  if (location.pathname !== "/acelera") return <Outlet />;

  const filtered = forms.filter((f) =>
    (filtroMes === "todos" || String(f.mes_referencia ?? "") === filtroMes) &&
    (filtroAno === "todos" || String(f.ano_referencia ?? "") === filtroAno) &&
    (filtroSup === "todos" || (f.criador_nome ?? f.superintendente ?? "") === filtroSup)
  );
  const resumo = filtered.reduce((acc, formulario) => {
    const c = counts[formulario.id] || { participantes: 0, gerentes: 0, investido: 0, finalizados: 0 };
    acc.participantes += c.participantes;
    acc.gerentes += c.gerentes;
    acc.investido += c.investido;
    acc.finalizados += c.finalizados;
    return acc;
  }, { participantes: 0, gerentes: 0, investido: 0, finalizados: 0 });
  const normalizaNome = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const diretorAtual = diretores.find((diretor) => normalizaNome(diretor.nome) === normalizaNome(nomeUsuario || ""));
  const supsVisiveis = superintendentes
    .filter((sup) => !normalizaNome(sup.nome).includes("PROCESSOS INTERNOS"))
    .filter((sup) => !isDiretor || !diretorAtual || sup.diretor_id === diretorAtual.id);
  const formulariosDoSup = (sup: { id: string; nome: string }) => filtered.filter((formulario) => {
    const responsavel = formulario.criador_nome ?? formulario.superintendente ?? "";
    return formulario.usuario_id === sup.id || normalizaNome(responsavel).includes(normalizaNome(sup.nome));
  });
  const supAberto = supsVisiveis.find((sup) => sup.id === supSelecionado) ?? null;
  const mesesSupAberto = supAberto ? formulariosDoSup(supAberto) : [];

  return (
    <div className="space-y-8">
      <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
        // ACELERA VENDAS
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div />

        <div ref={filtrosRef} className="relative">
          <button type="button" onClick={() => setFiltrosAbertos((aberto) => !aberto)} className="flex h-9 items-center gap-2 border border-[#39FF14]/40 bg-black/70 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#39FF14] transition hover:border-[#39FF14] hover:bg-[#39FF14]/10"><span className="relative block h-4 w-6"><span className={`absolute top-1/2 h-[2px] w-3.5 bg-current transition ${filtrosAbertos ? "left-1/2 -translate-x-1/2 rotate-45" : "left-[22%] -translate-x-1/2 -rotate-[65deg]"}`} /><span className={`absolute top-1/2 h-[2px] w-3.5 bg-current transition ${filtrosAbertos ? "left-1/2 -translate-x-1/2 -rotate-45" : "left-[78%] -translate-x-1/2 -rotate-[65deg]"}`} /></span>Filtro</button>
          <div className={`absolute right-0 top-[calc(100%+10px)] z-50 w-72 space-y-3 border border-[#39FF14]/35 bg-black/95 p-4 shadow-[0_0_35px_rgba(57,255,20,0.12)] backdrop-blur-2xl transition-all ${filtrosAbertos ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}>
          <div className="border-b border-[#39FF14]/20 pb-2 text-[9px] uppercase tracking-[0.25em] text-white/40">/ / FILTROS</div>
          <Select value={filtroMes} onValueChange={setFiltroMes}>
            <SelectTrigger className={`${cyberSelectTrigger} w-full`}><SelectValue placeholder="MÊS" /></SelectTrigger>
            <SelectContent className={cyberSelectContent}>
              <SelectItem value="todos" className={cyberSelectItem}>TODOS</SelectItem>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)} className={cyberSelectItem}>{m.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroAno} onValueChange={setFiltroAno}>
            <SelectTrigger className={`${cyberSelectTrigger} w-full`}><SelectValue placeholder="ANO" /></SelectTrigger>
            <SelectContent className={cyberSelectContent}>
              <SelectItem value="todos" className={cyberSelectItem}>TODOS</SelectItem>
              {Array.from(new Set(forms.map((f) => f.ano_referencia).filter(Boolean) as number[])).sort((a, b) => b - a).map((y) => (
                <SelectItem key={y} value={String(y)} className={cyberSelectItem}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroSup} onValueChange={setFiltroSup}>
            <SelectTrigger className={`${cyberSelectTrigger} w-full`}><SelectValue placeholder="SUPERINTENDENTE" /></SelectTrigger>
            <SelectContent className={cyberSelectContent}>
              <SelectItem value="todos" className={cyberSelectItem}>TODOS</SelectItem>
              {Array.from(new Set(forms.map((f) => f.criador_nome ?? f.superintendente).filter(Boolean) as string[])).sort().map((s) => (
                <SelectItem key={s} value={s} className={cyberSelectItem}>{s.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>
      </div>

      <section className="border border-[#39FF14]/25 bg-black/55 p-4 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between border-b border-[#39FF14]/15 pb-3"><h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">/ / RESUMO</h2><span className="text-[9px] uppercase tracking-[0.18em] text-white/40">{filtered.length} competências</span></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="border border-white/10 bg-white/[0.025] p-3"><div className={cyberStatLabel}>Corretores</div><div className="mt-1 font-mono text-xl font-bold text-white">{resumo.participantes}</div></div>
          <div className="border border-white/10 bg-white/[0.025] p-3"><div className={cyberStatLabel}>Gerentes</div><div className="mt-1 font-mono text-xl font-bold text-white">{resumo.gerentes}</div></div>
          <div className="border border-white/10 bg-white/[0.025] p-3"><div className={cyberStatLabel}>Finalizados</div><div className="mt-1 font-mono text-xl font-bold text-white">{resumo.finalizados}<span className="text-xs text-white/35">/{resumo.participantes}</span></div></div>
          <div className="border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-3 lg:col-span-2"><div className={cyberStatLabel}>Total investido</div><div className="mt-1 font-mono text-xl font-bold text-[#39FF14]">{brl(resumo.investido)}</div></div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {supsVisiveis.map((sup) => {
            const formularios = formulariosDoSup(sup);
            const totalSup = formularios.reduce((total, formulario) => {
              const c = counts[formulario.id] || { participantes: 0, gerentes: 0, investido: 0, finalizados: 0 };
              total.participantes += c.participantes;
              total.gerentes += c.gerentes;
              total.investido += c.investido;
              total.finalizados += c.finalizados;
              return total;
            }, { participantes: 0, gerentes: 0, investido: 0, finalizados: 0 });
            return (
              <button key={sup.id} type="button" onClick={() => setSupSelecionado(sup.id)} className="block min-w-0 text-left">
                <Card className={`${cyberCard} ${cyberCardHover} h-full border-[#39FF14]/25 hover:border-[#39FF14]`}>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="truncate border-b border-white/10 pb-2 text-xs uppercase tracking-[0.15em] text-[#39FF14]" title={sup.nome}>{sup.nome}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div className="space-y-2 text-[10px] uppercase tracking-[0.1em]">
                      <div className="flex justify-between gap-2"><span className="text-white/45">Corretores</span><strong className="font-mono text-white">{totalSup.participantes}</strong></div>
                      <div className="flex justify-between gap-2"><span className="text-white/45">Gerentes</span><strong className="font-mono text-white">{totalSup.gerentes}</strong></div>
                      <div className="flex justify-between gap-2"><span className="text-white/45">Finalizados</span><strong className="font-mono text-white">{totalSup.finalizados}/{totalSup.participantes}</strong></div>
                      <div className="flex justify-between gap-2 border-t border-white/10 pt-2"><span className="text-white/45">Investimento</span><strong className="font-mono text-[#39FF14]">{brl(totalSup.investido)}</strong></div>
                    </div>
                    <div className="text-[7px] uppercase tracking-[0.12em] text-white/25">{formularios.length ? "Clique para escolher o mês" : "Sem lançamento"}</div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
          {supsVisiveis.length === 0 && <div className={`${cyberCard} ${cyberEmpty} xl:col-span-6`}><FileText className="h-10 w-10 text-[#39FF14]/60" /><p>Nenhum superintendente vinculado.</p></div>}
      </div>

      <Dialog open={!!supSelecionado} onOpenChange={(aberto) => !aberto && setSupSelecionado(null)}>
        <DialogContent className="border border-[#39FF14]/35 bg-black/95 text-white shadow-[0_0_45px_rgba(57,255,20,0.13)] backdrop-blur-2xl sm:max-w-md">
          <DialogHeader><DialogTitle className="text-sm uppercase tracking-[0.2em] text-[#39FF14]">{supAberto?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {mesesSupAberto.map((formulario) => (
              <Link key={formulario.id} to="/acelera/$id" params={{ id: formulario.id }} className="flex items-center justify-between border border-white/10 bg-white/[0.025] p-3 transition hover:border-[#39FF14]/60 hover:bg-[#39FF14]/[0.04]">
                <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-white">{formulario.mes_referencia ? MESES[formulario.mes_referencia - 1] : "Mês não informado"}/{formulario.ano_referencia || "—"}</div><div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/35">{formulario.status}</div></div>
                <span className="text-[9px] uppercase tracking-[0.15em] text-[#39FF14]">Abrir / /</span>
              </Link>
            ))}
            {mesesSupAberto.length === 0 && <div className="border border-dashed border-white/10 p-6 text-center text-[10px] uppercase tracking-widest text-white/35">Nenhum lançamento nos filtros selecionados</div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
