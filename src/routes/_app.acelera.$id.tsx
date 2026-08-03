import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { brl, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Paperclip, FileText, X, DollarSign, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useHierarquia } from "@/hooks/useHierarquia";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2 } from "lucide-react";
import {
  cyberCard,
  cyberStat,
  cyberStatLabel,
  cyberBadge,
  cyberBadgeMuted,
  cyberBtn,
  cyberBtnGhost,
  cyberTableWrap,
  cyberTableHead,
} from "@/lib/cyber-ui";

export const Route = createFileRoute("/_app/acelera/$id")({
  component: AceleraDetail,
});

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const BUCKET = "lancamento-anexos";

type AnexoTipo = "comp_corretor" | "comp_gerente" | "comp_sup" | "boleto_diretor";

interface Form {
  id: string;
  nome: string | null;
  superintendente: string | null;
  mes_referencia: number | null;
  ano_referencia: number | null;
  status: string;
  acelera_finalizado_em: string | null;
}

interface Lancamento {
  id: string;
  gerente: string | null;
  nome_recebedor: string | null;
  superintendente: string | null;
  verba_cury: number | null;
  verba_gerente: number | null;
  verba_superintendente: number | null;
  meta_gerente: number | null;
  comp_corretor_url: string | null;
  comp_gerente_url: string | null;
  comp_sup_url: string | null;
  boleto_diretor_url: string | null;
  acelera_finalizado_em: string | null;
}

const anexoCol = (t: AnexoTipo): keyof Lancamento => {
  if (t === "comp_corretor") return "comp_corretor_url";
  if (t === "comp_gerente") return "comp_gerente_url";
  if (t === "comp_sup") return "comp_sup_url";
  return "boleto_diretor_url";
};

function AceleraDetail() {
  const { id } = Route.useParams();
  const { user, role, canEdit } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [filtroGerente, setFiltroGerente] = useState<string>("todos");
  const [filtroEtapa, setFiltroEtapa] = useState<string>("todas");
  const { gerentesBySupNome } = useHierarquia();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const compInputRef = useRef<HTMLInputElement>(null);
  const boletoInputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<{ lancId: string; tipo: AnexoTipo } | null>(null);

  // Pagar Acelera Vendas (sequential)
  const [payOpen, setPayOpen] = useState(false);
  const [payQueue, setPayQueue] = useState<Lancamento[]>([]);
  const [payIndex, setPayIndex] = useState(0);
  const [payStep, setPayStep] = useState(0); // 0: comp_corretor, 1: comp_gerente, 2: comp_sup, 3: boleto_diretor
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const load = async () => {
    const { data: f, error: e1 } = await supabase.from("formularios").select("id,nome,superintendente,mes_referencia,ano_referencia,status,tipo,acelera_finalizado_em").eq("id", id).single();
    if (e1) return toast.error(e1.message);
    if ((f as any).tipo !== "planejamento") {
      toast.error("Acelera Vendas só está disponível para Planejamentos.");
      return;
    }
    setForm(f as any);
    const { data: l, error: e2 } = await supabase
      .from("lancamentos")
      .select("id,gerente,nome_recebedor,superintendente,verba_cury,verba_gerente,verba_superintendente,meta_gerente,comp_corretor_url,comp_gerente_url,comp_sup_url,boleto_diretor_url,acelera_finalizado_em")
      .eq("formulario_id", id)
      .eq("secao", "acelera")
      .order("gerente", { ascending: true });
    if (e2) toast.error(e2.message);
    else setLancs((l || []) as Lancamento[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const PAY_STEPS: Array<{ key: AnexoTipo; col: keyof Lancamento; label: string }> = [
    { key: "comp_corretor", col: "comp_corretor_url", label: "Comprovante Corretor" },
    { key: "comp_gerente", col: "comp_gerente_url", label: "Comprovante Gerente" },
    { key: "comp_sup", col: "comp_sup_url", label: "Comprovante Superintendente" },
    { key: "boleto_diretor", col: "boleto_diretor_url", label: "Boleto Diretor" },
  ];

  const loadAnexoUrl = async (path: string | null) => {
    if (!path) { setPayUrl(null); return; }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error) { setPayUrl(null); toast.error(error.message); return; }
    setPayUrl(data.signedUrl);
  };

  const startPay = () => {
    const fila = lancs.filter((l) =>
      !l.acelera_finalizado_em &&
      l.comp_corretor_url && l.comp_gerente_url && l.comp_sup_url && l.boleto_diretor_url
    );
    if (fila.length === 0) {
      toast.info("Nenhum lançamento com os 4 anexos pendente de pagamento.");
      return;
    }
    setPayQueue(fila);
    setPayIndex(0);
    setPayStep(0);
    setPayOpen(true);
    loadAnexoUrl(fila[0].comp_corretor_url);
  };

  const advanceStep = () => {
    const atual = payQueue[payIndex];
    if (!atual) return;
    if (payStep < 3) {
      const next = payStep + 1;
      setPayStep(next);
      loadAnexoUrl(atual[PAY_STEPS[next].col] as string | null);
    }
  };

  const confirmPago = async () => {
    const atual = payQueue[payIndex];
    if (!atual) return;
    setPaying(true);
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("lancamentos")
      .update({ acelera_finalizado_em: agora, acelera_finalizado_por: user!.id } as never)
      .eq("id", atual.id);
    setPaying(false);
    if (error) return toast.error(error.message);
    toast.success(`Pago: ${atual.nome_recebedor || atual.gerente || "lançamento"}`);

    // Atualiza estado local
    const novosLancs = lancs.map((x) => x.id === atual.id ? { ...x, acelera_finalizado_em: agora } : x);
    setLancs(novosLancs);

    const proximo = payIndex + 1;
    if (proximo >= payQueue.length) {
      // Verifica se todos finalizados -> marca formulário
      const todos = novosLancs.length > 0 && novosLancs.every((x) => !!x.acelera_finalizado_em);
      if (todos && !form?.acelera_finalizado_em) {
        await supabase.from("formularios").update({ acelera_finalizado_em: agora, acelera_finalizado_por: user!.id }).eq("id", id);
        setForm((p) => p ? { ...p, acelera_finalizado_em: agora } as any : p);
        toast.success("Todos os lançamentos finalizados — formulário movido para Finalizados");
      }
      setPayOpen(false);
      setPayQueue([]);
      setPayUrl(null);
      return;
    }
    setPayIndex(proximo);
    setPayStep(0);
    loadAnexoUrl(payQueue[proximo].comp_corretor_url);
  };

  const closePay = () => {
    setPayOpen(false);
    setPayUrl(null);
    setPayQueue([]);
    setPayIndex(0);
    setPayStep(0);
  };

  const toggleFinalizado = async (l: Lancamento) => {
    if (role !== "admin") return;
    if (!l.acelera_finalizado_em) {
      if (!l.comp_corretor_url || !l.comp_gerente_url || !l.comp_sup_url || !l.boleto_diretor_url) {
        return toast.error("Anexe os 4 comprovantes antes de finalizar.");
      }
    }
    const novo = l.acelera_finalizado_em ? null : new Date().toISOString();
    const { error } = await supabase.from("lancamentos").update({ acelera_finalizado_em: novo, acelera_finalizado_por: novo ? user!.id : null } as never).eq("id", l.id);
    if (error) return toast.error(error.message);

    // Re-check formulário: se todos finalizados -> marca formulário; senão, garante reaberto
    const updated = lancs.map((x) => x.id === l.id ? { ...x, acelera_finalizado_em: novo } : x);
    setLancs(updated);
    const todos = updated.length > 0 && updated.every((x) => !!x.acelera_finalizado_em);
    if (todos && !form?.acelera_finalizado_em) {
      await supabase.from("formularios").update({ acelera_finalizado_em: new Date().toISOString(), acelera_finalizado_por: user!.id }).eq("id", id);
      setForm((p) => p ? { ...p, acelera_finalizado_em: new Date().toISOString() } as any : p);
      toast.success("Todos os lançamentos finalizados — formulário movido para Finalizados");
    } else if (!todos && form?.acelera_finalizado_em) {
      await supabase.from("formularios").update({ acelera_finalizado_em: null, acelera_finalizado_por: null }).eq("id", id);
      setForm((p) => p ? { ...p, acelera_finalizado_em: null } as any : p);
      toast.success(novo ? "Lançamento finalizado" : "Lançamento reaberto — formulário reaberto");
    } else {
      toast.success(novo ? "Lançamento finalizado" : "Lançamento reaberto");
    }
  };

  const triggerUpload = (lancId: string, tipo: AnexoTipo) => {
    targetRef.current = { lancId, tipo };
    (tipo === "boleto_diretor" ? boletoInputRef : compInputRef).current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !targetRef.current) return;
    const { lancId, tipo } = targetRef.current;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${id}/${lancId}/${tipo}-${Date.now()}.${ext}`;
    setUploadingId(lancId);
    const lanc = lancs.find((l) => l.id === lancId);
    const col = anexoCol(tipo);
    const oldPath = lanc?.[col] as string | null | undefined;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (upErr) { setUploadingId(null); return toast.error(upErr.message); }
    const { error: dbErr } = await supabase.from("lancamentos").update({ [col]: path } as never).eq("id", lancId);
    setUploadingId(null);
    if (dbErr) return toast.error(dbErr.message);
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    toast.success("Anexo enviado");
    load();
  };

  const removeAnexo = async (lancId: string, tipo: AnexoTipo) => {
    const lanc = lancs.find((l) => l.id === lancId);
    const col = anexoCol(tipo);
    const path = lanc?.[col] as string | null | undefined;
    if (!path) return;
    const { error } = await supabase.from("lancamentos").update({ [col]: null } as never).eq("id", lancId);
    if (error) return toast.error(error.message);
    await supabase.storage.from(BUCKET).remove([path]);
    toast.success("Anexo removido");
    load();
  };

  if (!form) return <p className="text-[11px] uppercase tracking-[0.3em] text-[#39FF14]/70">Carregando…</p>;

  const isValidated = form.status === "validado";
  const gerentesDisponiveis = gerentesBySupNome(form.superintendente || "todos").map((g) => g.nome);
  const etapaDe = (l: Lancamento): "corretor" | "gerente" | "sup" | "diretor" | "finalizado" => {
    if (l.acelera_finalizado_em) return "finalizado";
    if (!l.comp_corretor_url) return "corretor";
    if (!l.comp_gerente_url) return "gerente";
    if (!l.comp_sup_url) return "sup";
    return "diretor";
  };
  const view = lancs
    .filter((l) => filtroGerente === "todos" ? true : (l.gerente || "") === filtroGerente)
    .filter((l) => filtroEtapa === "todas" ? true : etapaDe(l) === filtroEtapa);

  const totCor = view.reduce((s, l) => s + Number(l.verba_cury || 0), 0);
  const totGer = view.reduce((s, l) => s + Number(l.verba_gerente || 0), 0);
  const totSup = view.reduce((s, l) => s + Number(l.verba_superintendente || 0), 0);
  const totDir = view.reduce((s, l) => s + Number(l.meta_gerente || 0), 0);
  const totInv = totCor + totGer + totSup + totDir;
  const totFinal = view.filter((l) => !!l.acelera_finalizado_em).length;

  return (
    <div className="space-y-8">
      <input ref={compInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
      <input ref={boletoInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />

      <Link to="/acelera" className="inline-flex items-center text-[10px] uppercase tracking-[0.3em] text-gray-400 hover:text-[#39FF14]">
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
      </Link>

      <div className="space-y-2">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
          // ACELERA VENDAS
        </div>
        <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
          {[
            form.mes_referencia && form.ano_referencia ? `Ref: ${MESES[form.mes_referencia - 1]}/${form.ano_referencia}` : null,
            form.superintendente ? `Sup.: ${form.superintendente}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/formularios/$id" params={{ id: form.id }} className="text-[10px] uppercase tracking-[0.25em] text-[#39FF14] hover:underline">
            Planejamento →
          </Link>
        </div>
      </div>

      {!isValidated && (
        <div className="rounded-none border border-blue-400/40 bg-blue-950/40 backdrop-blur-md p-3 text-[11px] uppercase tracking-[0.2em] text-blue-200">
          Aguardando validação do admin no Planejamento — comprovantes e boletos só podem ser anexados após a validação.
        </div>
      )}
      {isValidated && (
        <div className="rounded-none border border-[#39FF14]/40 bg-[#39FF14]/5 backdrop-blur-md p-3 text-[11px] uppercase tracking-[0.2em] text-[#39FF14]">
          Planejamento validado — anexe os comprovantes e boletos seguindo a hierarquia (Corretor → Gerente → Sup. → Diretor).
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <div className={cyberStat}><div className={cyberStatLabel}>Total Investido</div><div className="text-xl font-bold text-[#39FF14]">{brl(totInv)}</div></div>
        <div className={cyberStat}><div className={cyberStatLabel}>Corretores</div><div className="text-xl font-bold text-gray-100">{brl(totCor)}</div></div>
        <div className={cyberStat}><div className={cyberStatLabel}>Gerentes</div><div className="text-xl font-bold text-gray-100">{brl(totGer)}</div></div>
        <div className={cyberStat}><div className={cyberStatLabel}>Sup.</div><div className="text-xl font-bold text-gray-100">{brl(totSup)}</div></div>
        <div className={cyberStat}><div className={cyberStatLabel}>Diretores</div><div className="text-xl font-bold text-gray-100">{brl(totDir)}</div></div>
      </div>
      <div className={`${cyberStat} flex items-center justify-between`}>
        <div>
          <div className={cyberStatLabel}>Finalizados</div>
          <div className="text-xl font-bold text-gray-100">{totFinal}<span className="text-xs text-gray-500">/{view.length}</span></div>
        </div>
        {form.acelera_finalizado_em && <Badge className={cyberBadge}><CheckCircle2 className="h-3 w-3 mr-1" />Formulário finalizado</Badge>}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {gerentesDisponiveis.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#39FF14]/70">Gerente:</span>
            <select className="h-9 rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md px-2 text-[10px] uppercase tracking-widest text-gray-300 focus:border-[#39FF14] outline-none" value={filtroGerente} onChange={(e) => setFiltroGerente(e.target.value)}>
              <option value="todos">Todos os gerentes</option>
              {gerentesDisponiveis.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.25em] text-[#39FF14]/70">Etapa:</span>
          <select className="h-9 rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md px-2 text-[10px] uppercase tracking-widest text-gray-300 focus:border-[#39FF14] outline-none" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
            <option value="todas">Todas as etapas</option>
            <option value="corretor">Corretor</option>
            <option value="gerente">Gerente</option>
            <option value="sup">Superintendente</option>
            <option value="diretor">Diretor</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </div>
      </div>

      {role === "admin" && (
        <div className="flex justify-end">
          <Button
            onClick={startPay}
            disabled={!isValidated}
            className={cyberBtn}
            title={!isValidated ? "Disponível somente após validação do Planejamento" : "Pagar lançamentos com os 4 anexos"}
          >
            <DollarSign className="h-4 w-4 mr-1" /> Pagar Acelera Vendas
          </Button>
        </div>
      )}

      <div className={cyberTableWrap}>
        <Table>
          <TableHeader>
            <TableRow className="border-[#39FF14]/20 hover:bg-transparent">
              <TableHead className={cyberTableHead}>Gerente</TableHead>
              <TableHead className={cyberTableHead}>Corretor</TableHead>
              <TableHead className={`${cyberTableHead} text-right`}>Investido</TableHead>
              <TableHead className={cyberTableHead}>Comp. Corretor</TableHead>
              <TableHead className={cyberTableHead}>Comp. Gerente</TableHead>
              <TableHead className={cyberTableHead}>Comp. Sup.</TableHead>
              <TableHead className={cyberTableHead}>Boleto Diretor</TableHead>
              {role === "admin" && <TableHead className={`${cyberTableHead} text-center`}>Finalizar</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
              {view.length === 0 ? (
                <TableRow className="border-[#39FF14]/10"><TableCell colSpan={role === "admin" ? 8 : 7} className="py-8 text-center text-[11px] uppercase tracking-[0.25em] text-gray-500">Nenhum participante. Adicione na seção Acelera do Planejamento.</TableCell></TableRow>
              ) : view.map((l) => {
                const inv = Number(l.verba_cury || 0) + Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0) + Number(l.meta_gerente || 0);
                const steps: Array<{ key: AnexoTipo; url: string | null; label: string; req: string | null }> = [
                  { key: "comp_corretor", url: l.comp_corretor_url, label: "Comprovante", req: null },
                  { key: "comp_gerente", url: l.comp_gerente_url, label: "Comprovante", req: l.comp_corretor_url },
                  { key: "comp_sup", url: l.comp_sup_url, label: "Comprovante", req: l.comp_gerente_url },
                  { key: "boleto_diretor", url: l.boleto_diretor_url, label: "Boleto", req: l.comp_sup_url },
                ];
                return (
                  <TableRow key={l.id} className="border-[#39FF14]/10 hover:bg-[#39FF14]/5">
                    <TableCell className="font-medium text-gray-200">{l.gerente || "—"}</TableCell>
                    <TableCell className="text-gray-300">{l.nome_recebedor || "—"}</TableCell>
                    <TableCell className="text-right font-bold text-[#39FF14]">{brl(inv)}</TableCell>
                    {steps.map((st) => {
                      const blocked = !st.url && st.req == null ? false : !st.url && !st.req;
                      return (
                        <TableCell key={st.key}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant={st.url ? "secondary" : "outline"}
                              size="sm"
                              onClick={() => triggerUpload(l.id, st.key)}
                              disabled={!isValidated || uploadingId === l.id || blocked || !!l.acelera_finalizado_em}
                              title={!isValidated ? "Disponível somente após validação do Planejamento" : blocked ? "Anexe o nível anterior primeiro" : st.label}
                              className={st.url ? cyberBtn : cyberBtnGhost}
                            >
                              {st.key === "boleto_diretor" ? <FileText className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />} {st.label} {st.url && "✓"}
                            </Button>
                            {st.url && isValidated && !l.acelera_finalizado_em && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-400" onClick={() => removeAnexo(l.id, st.key)}><X className="h-3 w-3" /></Button>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                    {role === "admin" && (
                      <TableCell className="text-center">
                        {l.acelera_finalizado_em ? (
                          <Button size="sm" className={cyberBtnGhost} onClick={() => toggleFinalizado(l)}>
                            <CheckCircle2 className="h-3 w-3 mr-1 text-[#39FF14]" /> Reabrir
                          </Button>
                        ) : (
                          <Button size="sm" className={cyberBtn} onClick={() => toggleFinalizado(l)} disabled={!l.comp_corretor_url || !l.comp_gerente_url || !l.comp_sup_url || !l.boleto_diretor_url}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Finalizar
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500">
        Para incluir/remover participantes, edite a seção <strong>Acelera Vendas</strong> dentro do Planejamento.
      </p>

      <Dialog open={payOpen} onOpenChange={(o) => { if (!o) closePay(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Pagar Acelera Vendas
              {payQueue.length > 0 && (
                <span className="text-sm text-muted-foreground font-normal">
                  ({payIndex + 1} de {payQueue.length})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {payQueue[payIndex] && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">Gerente:</span> <strong>{payQueue[payIndex].gerente || "—"}</strong></div>
                <div><span className="text-muted-foreground">Corretor:</span> <strong>{payQueue[payIndex].nome_recebedor || "—"}</strong></div>
                <div>
                  <span className="text-muted-foreground">Investido:</span>{" "}
                  <strong>
                    {brl(
                      Number(payQueue[payIndex].verba_cury || 0) +
                      Number(payQueue[payIndex].verba_gerente || 0) +
                      Number(payQueue[payIndex].verba_superintendente || 0) +
                      Number(payQueue[payIndex].meta_gerente || 0)
                    )}
                  </strong>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {PAY_STEPS.map((s, i) => (
                  <div key={s.key} className={`px-2 py-1 rounded border ${i === payStep ? "bg-primary text-primary-foreground border-primary" : i < payStep ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {i < payStep && "✓ "}{s.label}
                  </div>
                ))}
              </div>
              <div className="text-sm font-medium">{PAY_STEPS[payStep].label}</div>
              <div className="rounded-md border overflow-hidden bg-muted/20" style={{ height: 500 }}>
                {payUrl ? (
                  <iframe src={payUrl} className="w-full h-full" title={PAY_STEPS[payStep].label} />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>
                )}
              </div>
              {payUrl && (
                <a href={payUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Abrir em nova aba
                </a>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closePay} disabled={paying}>Fechar</Button>
            {payStep < 3 ? (
              <Button onClick={advanceStep} disabled={!payUrl} className="bg-blue-600 hover:bg-blue-700">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Validar — Próximo
              </Button>
            ) : (
              <Button onClick={confirmPago} disabled={paying || !payUrl} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4 mr-1" /> PAGO {payIndex + 1 < payQueue.length ? "— Próximo lançamento" : "— Finalizar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}