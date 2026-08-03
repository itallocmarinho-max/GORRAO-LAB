import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2 } from "lucide-react";
import { brl, fmtDateTime } from "@/lib/format";
import { StatusBadge } from "@/lib/status";
import { toast } from "sonner";
import { CyberHeading } from "@/components/cyber/CyberHeading";
import {
  cyberCard,
  cyberCardHover,
  cyberSelectTrigger,
  cyberSelectContent,
  cyberSelectItem,
  cyberTabs,
  cyberTabBtn,
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
  const { user, role, canEdit, isRH, vinculadoId } = useAuth();
  const [forms, setForms] = useState<PlanForm[]>([]);
  const [counts, setCounts] = useState<Record<string, { participantes: number; gerentes: number; investido: number; finalizados: number }>>({});
  const [filtroMes, setFiltroMes] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const [filtroSup, setFiltroSup] = useState("todos");
  const [tab, setTab] = useState<"andamento" | "finalizados">("andamento");

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
    (filtroSup === "todos" || (f.criador_nome ?? f.superintendente ?? "") === filtroSup) &&
    (tab === "finalizados" ? !!f.acelera_finalizado_em : !f.acelera_finalizado_em)
  );
  const totAnd = forms.filter((f) => !f.acelera_finalizado_em).length;
  const totFin = forms.filter((f) => !!f.acelera_finalizado_em).length;

  return (
    <div className="space-y-8">
      <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
        // ACELERA VENDAS
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className={cyberTabs}>
          <button type="button" onClick={() => setTab("andamento")} className={cyberTabBtn(tab === "andamento")}>Em andamento ({totAnd})</button>
          <button type="button" onClick={() => setTab("finalizados")} className={cyberTabBtn(tab === "finalizados")}>Finalizados ({totFin})</button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={filtroMes} onValueChange={setFiltroMes}>
            <SelectTrigger className={`${cyberSelectTrigger} w-[140px]`}><SelectValue placeholder="MÊS" /></SelectTrigger>
            <SelectContent className={cyberSelectContent}>
              <SelectItem value="todos" className={cyberSelectItem}>TODOS</SelectItem>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)} className={cyberSelectItem}>{m.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroAno} onValueChange={setFiltroAno}>
            <SelectTrigger className={`${cyberSelectTrigger} w-[120px]`}><SelectValue placeholder="ANO" /></SelectTrigger>
            <SelectContent className={cyberSelectContent}>
              <SelectItem value="todos" className={cyberSelectItem}>TODOS</SelectItem>
              {Array.from(new Set(forms.map((f) => f.ano_referencia).filter(Boolean) as number[])).sort((a, b) => b - a).map((y) => (
                <SelectItem key={y} value={String(y)} className={cyberSelectItem}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroSup} onValueChange={setFiltroSup}>
            <SelectTrigger className={`${cyberSelectTrigger} w-[220px]`}><SelectValue placeholder="SUPERINTENDENTE" /></SelectTrigger>
            <SelectContent className={cyberSelectContent}>
              <SelectItem value="todos" className={cyberSelectItem}>TODOS</SelectItem>
              {Array.from(new Set(forms.map((f) => f.criador_nome ?? f.superintendente).filter(Boolean) as string[])).sort().map((s) => (
                <SelectItem key={s} value={s} className={cyberSelectItem}>{s.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={`${cyberCard} ${cyberEmpty}`}>
          <FileText className="h-10 w-10 text-[#39FF14]/60" />
          <p>Nenhum planejamento encontrado.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((f) => {
            const c = counts[f.id] || { participantes: 0, gerentes: 0, investido: 0, finalizados: 0 };
            const finalizado = !!f.acelera_finalizado_em;
            return (
              <Link key={f.id} to="/acelera/$id" params={{ id: f.id }} className="block">
                <Card className={`${cyberCard} ${cyberCardHover} border-[#1e3a8a] hover:border-[#1e3a8a]`}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm uppercase tracking-[0.15em] text-gray-100">{f.nome || fmtDateTime(f.created_at)}</CardTitle>
                      <div className="flex items-center gap-1">
                        {finalizado && <Badge className={`${cyberBadge}`}><CheckCircle2 className="h-3 w-3 mr-1" />Final</Badge>}
                        <StatusBadge status={f.status as any} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className={cyberBadgeMuted}>{f.criador_nome ?? f.superintendente ?? "—"}</Badge>
                      {f.mes_referencia && f.ano_referencia && (
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[#39FF14]/70">{MESES[f.mes_referencia - 1]}/{f.ano_referencia}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className={cyberStat}><div className={cyberStatLabel}>Corretores</div><div className={cyberStatValue}>{c.participantes}</div></div>
                      <div className={cyberStat}><div className={cyberStatLabel}>Gerentes</div><div className={cyberStatValue}>{c.gerentes}</div></div>
                      <div className={cyberStat}><div className={cyberStatLabel}>Investimento</div><div className="text-sm font-bold text-[#39FF14]">{brl(c.investido)}</div></div>
                      <div className={cyberStat}><div className={cyberStatLabel}>Finalizados</div><div className={cyberStatValue}>{c.finalizados}<span className="text-xs text-gray-500">/{c.participantes}</span></div></div>
                    </div>
                    {f.status !== "validado" && !finalizado && (
                      <Badge className={cyberBadgeMuted}>Anexos liberados após validação</Badge>
                    )}
                    {role === "admin" && canEdit && (
                      finalizado ? (
                        <Button size="sm" className={`${cyberBtnGhost} w-full`} onClick={(e) => reabrir(e, f)}>Reabrir Acelera</Button>
                      ) : (
                        <Button size="sm" className={`${cyberBtn} w-full`} onClick={(e) => finalizar(e, f)} disabled={f.status !== "validado"}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar Acelera
                        </Button>
                      )
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}