import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pushUndo } from "@/lib/undo";
import { gerenteDisponivelEm } from "@/lib/gerentes";
import { useActiveFormType } from "@/hooks/useActiveFormType";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, fmtDateTime, fmtDate, fmtTime } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Lock, CheckCircle2, Pencil, Paperclip, FileText, Eye, X, Check, XCircle, AlertTriangle, Download, Target, Wallet, Zap, Users, BarChart3, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPOS_GASTO, tipoLabel, semanasDoMes, destinacaoFromTipoGasto, type SemanaOpt } from "@/lib/form-types";
import { Checkbox } from "@/components/ui/checkbox";
import type { TablesInsert } from "@/integrations/supabase/types";
import { notifyVerbaStatus } from "@/lib/notify-verba.functions";
import { CyberBackdrop } from "@/components/CyberBackdrop";


export const Route = createFileRoute("/_app/formularios/$id")({
  component: FormDetail,
});

type PeopleOpts = { sups: string[]; gers: string[] };

function PessoaSelectContentItems({ opts, includeTodos = false, cyber = false }: { opts: PeopleOpts; includeTodos?: boolean; cyber?: boolean }) {
  const empty = opts.sups.length === 0 && opts.gers.length === 0;
  const itemCls = cyber
    ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10"
    : "";
  const groupCls = cyber
    ? "px-2 py-1 text-[10px] font-semibold text-[#39FF14] uppercase tracking-widest"
    : "px-2 py-1 text-xs font-semibold text-muted-foreground";
  const emptyCls = cyber
    ? "px-2 py-3 text-[10px] text-gray-500 uppercase tracking-widest text-center"
    : "px-2 py-3 text-sm text-muted-foreground text-center";
  const fmt = (n: string) => (cyber ? n.toUpperCase() : n);
  return (
    <>
      {includeTodos && <SelectItem value="todos" className={itemCls}>{cyber ? "TODOS" : "Todos"}</SelectItem>}
      {empty && !includeTodos && (
        <div className={emptyCls}>{cyber ? "NENHUMA PESSOA DISPONÍVEL" : "Nenhuma pessoa disponível"}</div>
      )}
      {opts.sups.length > 0 && (
        <>
          <div className={groupCls}>{cyber ? "SUPERINTENDENTES" : "Superintendentes"}</div>
          {opts.sups.map((n) => <SelectItem key={`sup-${n}`} value={n} className={itemCls}>{fmt(n)}</SelectItem>)}
        </>
      )}
      {opts.gers.length > 0 && (
        <>
          <div className={`${groupCls} mt-1`}>{cyber ? "GERENTES" : "Gerentes"}</div>
          {opts.gers.map((n) => <SelectItem key={`ger-${n}`} value={n} className={itemCls}>{fmt(n)}</SelectItem>)}
        </>
      )}
    </>
  );
}

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
  usuario_id: string;
  created_at: string;
  status: "editando" | "finalizado" | "validado" | "reprovado";
  semana_inicio: string | null;
}
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
interface Lancamento {
  id: string;
  nome_recebedor: string | null;
  valor: number;
  descricao: string | null;
  data_hora: string;
  comprovante_url: string | null;
  boleto_url: string | null;
  reprovado: boolean;
  motivo_reprovacao: string | null;
  quem_pagou: string | null;
  tipo_gasto: string | null;
  candidatos: number | null;
  contratados: number | null;
  gerente: string | null;
  fonte: string | null;
  superintendente: string | null;
  leads: number | null;
  semana_inicio: string | null;
  mes_ref: number | null;
  ano_ref: number | null;
  produto: string | null;
  plantao: string | null;
  meta_gerente: number | null;
  meta_sup: number | null;
  verba_cury: number | null;
  verba_gerente: number | null;
  verba_superintendente: number | null;
  secao: string | null;
  comp_corretor_url: string | null;
  comp_gerente_url: string | null;
  comp_sup_url: string | null;
  boleto_diretor_url: string | null;
  destinacao: string | null;
}

const BUCKET = "lancamento-anexos";

const PLANTOES = [
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

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 19);
}

function aceleraSplit(v: number) {
  const bases: Record<number, number> = { 2550: 1500, 5100: 3000, 8500: 5000, 13600: 8000, 17000: 10000 };
  const corretor = bases[v];
  if (corretor) return { corretor, gerente: corretor * 0.4, sup: corretor * 0.2, diretor: corretor * 0.1 };
  return { corretor: 0, gerente: 0, sup: 0, diretor: 0 };
}

type AceleraPacote = "2550" | "5100" | "8500" | "13600" | "17000" | "";
const ACELERA_PACOTES = [2550, 5100, 8500, 13600, 17000] as const;

function FormDetail() {
  const { id } = Route.useParams();
  const { setActiveFormType } = useActiveFormType();
  const [form, setForm] = useState<Form | null>(null);
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [gerentes, setGerentes] = useState<Array<{ id: string; nome: string; ativo: boolean; inativo_mes: number | null; inativo_ano: number | null }>>([]);
  const [allGerentes, setAllGerentes] = useState<Array<{ id: string; nome: string; ativo: boolean; inativo_mes: number | null; inativo_ano: number | null }>>([]);
  const [allSups, setAllSups] = useState<Array<{ id: string; nome: string }>>([]);
  const [allGerentesComSup, setAllGerentesComSup] = useState<Array<{ id: string; nome: string; sup: string; ativo: boolean; inativo_mes: number | null; inativo_ano: number | null }>>([]);
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string }>>([]);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataHora, setDataHora] = useState(nowLocalInput());
  const [busy, setBusy] = useState(false);
  // Campos extras por tipo
  const [quemPagou, setQuemPagou] = useState("");
  const [recebedorModo, setRecebedorModo] = useState<"self" | "gerentes">("self");
  const [gerentesSelecionados, setGerentesSelecionados] = useState<string[]>([]);
  const [tipoGasto, setTipoGasto] = useState<string>("");
  const [candidatos, setCandidatos] = useState("");
  const [contratados, setContratados] = useState("");
  const [gerente, setGerente] = useState("");
  const [fonte, setFonte] = useState("");
  const [arquivoMeta, setArquivoMeta] = useState<File | null>(null);
  // Leads
  const [leadsSuper, setLeadsSuper] = useState("");
  const [leadsQtd, setLeadsQtd] = useState("");
  const nowD = new Date();
  const [leadsMes, setLeadsMes] = useState(String(nowD.getMonth() + 1));
  const [leadsAno, setLeadsAno] = useState(String(nowD.getFullYear()));
  const [leadsSemana, setLeadsSemana] = useState("");
  const [contratacaoSemana, setContratacaoSemana] = useState("");
  const [leadsProduto, setLeadsProduto] = useState("");
  // Planejamento
  const [planSecao, setPlanSecao] = useState<"principal" | "verba" | "acelera">("principal");
  const [planPlantao, setPlanPlantao] = useState("");
  const [planMetaGer, setPlanMetaGer] = useState("");
  const [planMetaSup, setPlanMetaSup] = useState("");
  const [planMetas, setPlanMetas] = useState<Record<string, { ger: string; sup: string }>>({});
  const [plantoesList, setPlantoesList] = useState<string[]>(PLANTOES);
  const [planVerbaCury, setPlanVerbaCury] = useState("");
  const [planVerbaGer, setPlanVerbaGer] = useState("");
  const [planVerbaSup, setPlanVerbaSup] = useState("");
  const [aceleraSup, setAceleraSup] = useState("");
  const [aceleraRows, setAceleraRows] = useState<Array<{ corretor: string; valor: AceleraPacote }>>([
    { corretor: "", valor: "" },
  ]);
  const [editingAceleraGerente, setEditingAceleraGerente] = useState<string | null>(null);
  const [editingGerente, setEditingGerente] = useState<string | null>(null);
  const [editingVerbaId, setEditingVerbaId] = useState<string | null>(null);
  const [filtroGerente, setFiltroGerente] = useState<string>("todos");
  const [filtrosContratacaoAbertos, setFiltrosContratacaoAbertos] = useState(false);
  // Lançamento massivo por gerente (gastos_pessoais)
  const [bulkOpen, setBulkOpen] = useState(false);
  type BulkRow = { gerente: string; recebedor: string; tipoGasto: string; descricao: string; valor: string };
  const emptyBulkRow = (): BulkRow => ({ gerente: "", recebedor: "", tipoGasto: "", descricao: "", valor: "" });
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingBulkGerente, setEditingBulkGerente] = useState<string | null>(null);
  const [planejamentoValidado, setPlanejamentoValidado] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDiretor, setIsDiretor] = useState(false);
  const [diretorSups, setDiretorSups] = useState<Array<{ id: string; nome: string }>>([]);
  const [diretorGerentes, setDiretorGerentes] = useState<Array<{ id: string; nome: string; sup: string; ativo: boolean; inativo_mes: number | null; inativo_ano: number | null }>>([]);
  const [isSuperintendente, setIsSuperintendente] = useState(false);
  const [rhActsAsDiretor, setRhActsAsDiretor] = useState(false);
  const [rhActsAsSuperintendente, setRhActsAsSuperintendente] = useState(false);
  const [reprovarOpen, setReprovarOpen] = useState(false);
  const [reprovarLancId, setReprovarLancId] = useState<string | null>(null);
  const [reprovarMotivo, setReprovarMotivo] = useState("");
  const [currentNome, setCurrentNome] = useState<string>("");
  const [meusGerentes, setMeusGerentes] = useState<Array<{ id: string; nome: string; ativo: boolean; inativo_mes: number | null; inativo_ano: number | null }>>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const compInputRef = useRef<HTMLInputElement>(null);
  const boletoInputRef = useRef<HTMLInputElement>(null);
  type AnexoTipo = "comprovante" | "boleto" | "comp_corretor" | "comp_gerente" | "comp_sup" | "boleto_diretor";
  const targetRef = useRef<{ lancId: string; tipo: AnexoTipo } | null>(null);
  const anexoCol = (t: AnexoTipo): "comprovante_url" | "boleto_url" | "comp_corretor_url" | "comp_gerente_url" | "comp_sup_url" | "boleto_diretor_url" => {
    if (t === "comprovante") return "comprovante_url";
    if (t === "boleto") return "boleto_url";
    if (t === "comp_corretor") return "comp_corretor_url";
    if (t === "comp_gerente") return "comp_gerente_url";
    if (t === "comp_sup") return "comp_sup_url";
    return "boleto_diretor_url";
  };

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
      const { data: profFull } = await supabase.from("profiles").select("cargo, nome, email").eq("id", u.user.id).maybeSingle();
      const cargo = (profFull as any)?.cargo;
      const nomeAtual = ((profFull as any)?.nome || (profFull as any)?.email || "") as string;
      setCurrentNome(nomeAtual);
      const diretor = cargo === "diretor";
      const sup = cargo === "superintendente";
      setIsDiretor(diretor);
      setIsSuperintendente(sup);
      if (sup) {
        const { data: mg } = await supabase
          .from("gerentes")
          .select("id, nome, ativo, inativo_mes, inativo_ano")
          .eq("superintendente_id", u.user.id)
          .order("nome");
        setMeusGerentes((mg ?? []) as any[]);
      }
      if (diretor) {
        const { data: sups } = await supabase
          .from("profiles")
          .select("id, nome, email")
          .eq("cargo", "superintendente")
          .eq("diretor_id", u.user.id);
        const supList = ((sups ?? []) as any[])
          .map((s) => ({ id: s.id as string, nome: (s.nome || s.email || "—") as string }))
          .sort((a, b) => a.nome.localeCompare(b.nome));
        setDiretorSups(supList);
        if (supList.length > 0) {
          const { data: gers } = await supabase
            .from("gerentes")
            .select("id, nome, superintendente_id, ativo, inativo_mes, inativo_ano")
            .in("superintendente_id", supList.map((s) => s.id));
          const supById = new Map(supList.map((s) => [s.id, s.nome]));
          setDiretorGerentes(
            ((gers ?? []) as any[])
              .map((g) => ({ id: g.id as string, nome: g.nome as string, sup: supById.get(g.superintendente_id) || "", ativo: !!g.ativo, inativo_mes: g.inativo_mes ?? null, inativo_ano: g.inativo_ano ?? null }))
              .sort((a, b) => a.nome.localeCompare(b.nome)),
          );
        } else {
          setDiretorGerentes([]);
        }
      }
      if (cargo === "rh") {
        const { data: prof2 } = await supabase
          .from("profiles")
          .select("id, nome, email, cargo, vinculado_id")
          .eq("id", u.user.id)
          .maybeSingle();
        const vinculadoId = (prof2 as any)?.vinculado_id as string | null;
        if (vinculadoId) {
          const { data: vinc } = await supabase
            .from("profiles")
            .select("id, nome, email, cargo")
            .eq("id", vinculadoId)
            .maybeSingle();
          const vincCargo = (vinc as any)?.cargo as string | null;
          const vincNome = ((vinc as any)?.nome || (vinc as any)?.email || "") as string;
          if (vincCargo === "superintendente") {
            setRhActsAsSuperintendente(true);
            setCurrentNome(vincNome);
            const { data: mg } = await supabase
              .from("gerentes")
              .select("id, nome, ativo, inativo_mes, inativo_ano")
              .eq("superintendente_id", vinculadoId)
              .order("nome");
            setMeusGerentes((mg ?? []) as any[]);
          } else if (vincCargo === "diretor") {
            setRhActsAsDiretor(true);
            const { data: sups } = await supabase
              .from("profiles")
              .select("id, nome, email")
              .eq("cargo", "superintendente")
              .eq("diretor_id", vinculadoId);
            const supList = ((sups ?? []) as any[])
              .map((s) => ({ id: s.id as string, nome: (s.nome || s.email || "—") as string }))
              .sort((a, b) => a.nome.localeCompare(b.nome));
            setDiretorSups(supList);
            if (supList.length > 0) {
              const { data: gers } = await supabase
                .from("gerentes")
                .select("id, nome, superintendente_id, ativo, inativo_mes, inativo_ano")
                .in("superintendente_id", supList.map((s) => s.id));
              const supById = new Map(supList.map((s) => [s.id, s.nome]));
              setDiretorGerentes(
                ((gers ?? []) as any[])
                  .map((g) => ({ id: g.id as string, nome: g.nome as string, sup: supById.get(g.superintendente_id) || "", ativo: !!g.ativo, inativo_mes: g.inativo_mes ?? null, inativo_ano: g.inativo_ano ?? null }))
                  .sort((a, b) => a.nome.localeCompare(b.nome)),
              );
            } else {
              setDiretorGerentes([]);
            }
          }
        }
      }
    })();
  }, []);

  const load = async () => {
    const { data: f, error: e1 } = await supabase.from("formularios").select("*").eq("id", id).single();
    if (e1) return toast.error(e1.message);
    setForm(f as Form);
    // Carrega plantões configurados pelo admin para o mês/ano deste formulário
    if ((f as Form).tipo === "planejamento" || (f as Form).tipo === "acelera_vendas") {
      const mesRef = (f as Form).mes_referencia;
      const anoRef = (f as Form).ano_referencia;
      if (mesRef && anoRef) {
        const { data: pl } = await supabase
          .from("plantoes_mes")
          .select("nome, ordem")
          .eq("ano", anoRef)
          .eq("mes", mesRef)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true });
        if (pl && pl.length > 0) {
          setPlantoesList((pl as any[]).map((r) => r.nome as string));
        } else {
          setPlantoesList([]);
        }
      }
    }
    let supId: string | null = (f as Form).usuario_id ?? null;
    const supNome = (f as Form).superintendente;
    if (supNome) {
      const { data: supProf } = await supabase
        .from("profiles")
        .select("id")
        .eq("cargo", "superintendente")
        .eq("nome", supNome)
        .maybeSingle();
      if (supProf?.id) supId = supProf.id;
    }
    if (supId) {
      const { data: gers } = await supabase
        .from("gerentes")
        .select("id, nome, ativo, inativo_mes, inativo_ano")
        .eq("superintendente_id", supId)
        .order("nome");
      setGerentes(gers ?? []);
    }
    {
      const { data: us } = await supabase
        .from("profiles")
        .select("id, nome, email, cargo")
        .order("nome");
      setUsuarios(
        ((us ?? []) as any[])
          .filter((u) => u.cargo !== "administrador" && u.cargo !== "rh")
          .map((u) => ({ id: u.id, nome: u.nome || u.email || "—" })),
      );
    }
    if (isAdmin) {
      const { data: ag } = await supabase
        .from("gerentes")
        .select("id, nome, ativo, inativo_mes, inativo_ano")
        .order("nome");
      setAllGerentes((ag ?? []) as any[]);
    }
    if ((f as Form).tipo === "acelera_vendas") {
      // Buscar planejamento correspondente (mesmo mes/ano/superintendente)
      const { data: planForms } = await supabase
        .from("formularios")
        .select("id,status")
        .eq("tipo", "planejamento")
        .eq("mes_referencia", (f as Form).mes_referencia as number)
        .eq("ano_referencia", (f as Form).ano_referencia as number)
        .eq("superintendente", (f as Form).superintendente as string);
      const plan = (planForms || [])[0];
      setPlanejamentoValidado(plan?.status === "validado");
      if (plan && (f as Form).status === "editando" && plan.status !== "validado") {
        // Sync: copiar lancamentos acelera do planejamento que ainda não estão neste formulario
        const { data: planLancs } = await supabase
          .from("lancamentos")
          .select("*")
          .eq("formulario_id", plan.id)
          .eq("secao", "acelera");
        const { data: existing } = await supabase
          .from("lancamentos")
          .select("gerente,nome_recebedor")
          .eq("formulario_id", id)
          .eq("secao", "acelera");
        const existingKeys = new Set((existing || []).map((r: any) => `${r.gerente || ""}|${r.nome_recebedor || ""}`));
        const toInsert: TablesInsert<"lancamentos">[] = [];
        for (const pl of (planLancs || []) as Lancamento[]) {
          const key = `${pl.gerente || ""}|${pl.nome_recebedor || ""}`;
          if (existingKeys.has(key)) continue;
          toInsert.push({
            formulario_id: id,
            data_hora: new Date().toISOString(),
            secao: "acelera",
            gerente: pl.gerente,
            superintendente: pl.superintendente,
            nome_recebedor: pl.nome_recebedor,
            valor: Number(pl.valor),
            verba_cury: pl.verba_cury,
            verba_gerente: pl.verba_gerente,
            verba_superintendente: pl.verba_superintendente,
            meta_gerente: pl.meta_gerente,
          });
        }
        if (toInsert.length > 0) {
          await supabase.from("lancamentos").insert(toInsert);
        }
      }
    }
    const { data: l, error: e2 } = await supabase
      .from("lancamentos")
      .select("*")
      .eq("formulario_id", id)
      .order("data_hora", { ascending: true });
    if (e2) toast.error(e2.message);
    else setLancs((l || []) as Lancamento[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (form?.tipo) {
      setActiveFormType(form.tipo);
    }
    return () => {
      setActiveFormType(null);
    };
  }, [form?.tipo, setActiveFormType]);

  // Opções de pessoas (Sups + Gerentes) por papel do usuário logado
  const peopleOpts: PeopleOpts = (() => {
    const mesRef = form?.mes_referencia ?? null;
    const anoRef = form?.ano_referencia ?? null;
    const filterByRef = <T extends { ativo: boolean; inativo_mes: number | null; inativo_ano: number | null; nome: string }>(arr: T[]) =>
      arr.filter((g) => gerenteDisponivelEm(g, mesRef, anoRef));
    if (isDiretor || rhActsAsDiretor) {
      return {
        sups: diretorSups.map((s) => s.nome),
        gers: filterByRef(diretorGerentes).map((g) => g.nome),
      };
    }
    if (isSuperintendente || rhActsAsSuperintendente) {
      return {
        sups: currentNome ? [currentNome] : [],
        gers: filterByRef(meusGerentes).map((g) => g.nome),
      };
    }
    if (isAdmin) {
      return {
        sups: allSups.map((s) => s.nome),
        gers: filterByRef(allGerentesComSup).map((g) => g.nome),
      };
    }
    // fallback (outros): gerentes carregados pelo formulário
    return { sups: [], gers: filterByRef(gerentes).map((g) => g.nome) };
  })();

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: ag } = await supabase
        .from("gerentes")
        .select("id, nome, superintendente_id, ativo, inativo_mes, inativo_ano")
        .order("nome");
      setAllGerentes((ag ?? []) as any[]);
      const { data: sps } = await supabase
        .from("profiles")
        .select("id, nome, email")
        .eq("cargo", "superintendente");
      const supList = ((sps ?? []) as any[])
        .map((s) => ({ id: s.id as string, nome: (s.nome || s.email || "—") as string }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setAllSups(supList);
      const supById = new Map(supList.map((s) => [s.id, s.nome]));
      setAllGerentesComSup(
        ((ag ?? []) as any[])
          .map((g) => ({
            id: g.id as string,
            nome: g.nome as string,
            sup: supById.get(g.superintendente_id) || "",
            ativo: !!g.ativo,
            inativo_mes: g.inativo_mes ?? null,
            inativo_ano: g.inativo_ano ?? null,
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      );
    })();
  }, [isAdmin]);

  const openDialog = () => {
    setNome(""); setValor(""); setDescricao(""); setDataHora(nowLocalInput());
    setQuemPagou(""); setTipoGasto(""); setCandidatos(""); setContratados("");
    setRecebedorModo("self"); setGerentesSelecionados([]);
    setGerente(""); setFonte(""); setArquivoMeta(null);
    setLeadsSuper(""); setLeadsQtd(""); setLeadsSemana(""); setLeadsProduto(""); setContratacaoSemana("");
    setPlanSecao(form?.tipo === "acelera_vendas" ? "acelera" : "principal");
    setPlanPlantao(""); setPlanMetaGer(""); setPlanMetaSup("");
    setPlanMetas(Object.fromEntries(plantoesList.map((p) => [p, { ger: "", sup: "" }])));
    setPlanVerbaCury(""); setPlanVerbaGer(""); setPlanVerbaSup("");
    setAceleraSup(form?.tipo === "acelera_vendas" ? (form.superintendente || "") : "");
    setAceleraRows([{ corretor: "", valor: "" }]);
    setEditingAceleraGerente(null);
    setEditingGerente(null);
    setEditingVerbaId(null);
    setOpen(true);
  };

  const openEditPlanGerente = (gerenteName: string) => {
    const rows = lancs.filter((l) => (l.secao || "principal") === "principal" && (l.gerente || "") === gerenteName);
    const metas = Object.fromEntries(plantoesList.map((p) => [p, { ger: "", sup: "" }])) as Record<string, { ger: string; sup: string }>;
    rows.forEach((l) => {
      if (l.plantao && metas[l.plantao]) {
        metas[l.plantao] = {
          ger: l.meta_gerente != null ? String(l.meta_gerente) : "",
          sup: l.meta_sup != null ? String(l.meta_sup) : "",
        };
      }
    });
    setPlanSecao("principal");
    setGerente(gerenteName);
    setPlanMetas(metas);
    setPlanVerbaCury(""); setPlanVerbaGer(""); setPlanVerbaSup("");
    setEditingGerente(gerenteName);
    setOpen(true);
  };

  const openEditAceleraGerente = (gerenteName: string) => {
    const rows = lancs.filter((l) => l.secao === "acelera" && (l.gerente || "") === gerenteName);
    const sup = rows.find((l) => l.superintendente)?.superintendente || "";
    setPlanSecao("acelera");
    setGerente(gerenteName);
    setAceleraSup(sup);
    setAceleraRows(
      rows.length > 0
        ? rows.map((l) => ({
            corretor: l.nome_recebedor || "",
            valor: (ACELERA_PACOTES.includes(Number(l.valor) as (typeof ACELERA_PACOTES)[number]) ? String(Number(l.valor)) : "") as AceleraPacote,
          }))
        : [{ corretor: "", valor: "" }],
    );
    setEditingAceleraGerente(gerenteName);
    setEditingGerente(null);
    setEditingVerbaId(null);
    setOpen(true);
  };

  const openEditPlanVerba = (l: Lancamento) => {
    setPlanSecao("verba");
    setGerente(l.gerente || "");
    setPlanPlantao(l.plantao || "");
    setPlanVerbaCury(l.verba_cury != null ? String(l.verba_cury) : "");
    setPlanVerbaGer(l.verba_gerente != null ? String(l.verba_gerente) : "");
    setPlanVerbaSup(l.verba_superintendente != null ? String(l.verba_superintendente) : "");
    setEditingVerbaId(l.id);
    setEditingGerente(null);
    setEditingAceleraGerente(null);
    setOpen(true);
  };

  const openBulkGastos = () => {
    setBulkRows([emptyBulkRow()]);
    setEditingBulkGerente(null);
    setBulkOpen(true);
  };

  const openEditBulkGastosByGerente = (gerenteName: string) => {
    const rows = lancs.filter((l) => (l.quem_pagou || "") === gerenteName);
    setBulkRows(
      rows.length > 0
        ? rows.map((l) => ({
            gerente: l.quem_pagou || "",
            recebedor: l.nome_recebedor || "",
            tipoGasto: l.tipo_gasto || "",
            descricao: l.descricao || "",
            valor: String(l.valor ?? ""),
          }))
        : [emptyBulkRow()],
    );
    setEditingBulkGerente(gerenteName);
    setBulkOpen(true);
  };

  const updateBulkRow = (idx: number, patch: Partial<BulkRow>) => {
    setBulkRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addBulkRow = () => setBulkRows((prev) => [...prev, emptyBulkRow()]);
  const removeBulkRow = (idx: number) =>
    setBulkRows((prev) => (prev.length <= 1 ? [emptyBulkRow()] : prev.filter((_, i) => i !== idx)));

  const saveBulkGastos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const toInsert: TablesInsert<"lancamentos">[] = [];
    for (const r of bulkRows) {
      const v = Number(r.valor);
      if (!r.gerente && !r.recebedor && !r.valor && !r.descricao && !r.tipoGasto) continue;
      if (!r.gerente) return toast.error("Selecione o gerente em todas as linhas");
      if (!r.tipoGasto) return toast.error("Selecione o tipo de gasto em todas as linhas");
      if (!Number.isFinite(v) || v <= 0) return toast.error("Informe um valor válido em todas as linhas");
      toInsert.push({
        formulario_id: id,
        data_hora: new Date().toISOString(),
        nome_recebedor: r.recebedor || r.gerente,
        quem_pagou: r.gerente,
        gerente: r.gerente,
        valor: v,
        tipo_gasto: r.tipoGasto,
        destinacao: destinacaoFromTipoGasto(r.tipoGasto),
        descricao: r.descricao || null,
      });
    }
    if (!toInsert.length && !editingBulkGerente) return toast.error("Adicione pelo menos um lançamento");
    setBulkBusy(true);
    if (editingBulkGerente) {
      const { error: delErr } = await supabase
        .from("lancamentos")
        .delete()
        .eq("formulario_id", id)
        .eq("quem_pagou", editingBulkGerente);
      if (delErr) { setBulkBusy(false); return toast.error(delErr.message); }
    }
    if (toInsert.length === 0) {
      setBulkBusy(false);
      toast.success("Lançamentos removidos");
      setBulkOpen(false);
      setEditingBulkGerente(null);
      load();
      return;
    }
    const { error } = await supabase.from("lancamentos").insert(toInsert);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editingBulkGerente ? "Gerente atualizado" : `${toInsert.length} lançamento(s) salvo(s)`);
    setBulkOpen(false);
    setEditingBulkGerente(null);
    load();
  };

  const addLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    // Garantir que a sessão ainda está válida (evita perder o JWT e cair em RLS)
    const { data: sessData } = await supabase.auth.getSession();
    if (!sessData?.session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (!refreshed?.session) {
        setBusy(false);
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
    }
    const tipo = form.tipo;
    const payload: TablesInsert<"lancamentos"> = {
      formulario_id: id,
      data_hora: tipo === "verba_cury" ? new Date(dataHora).toISOString() : new Date().toISOString(),
    };
    if (tipo === "verba_cury") {
      payload.nome_recebedor = nome;
      payload.valor = Number(valor) || 0;
      payload.descricao = descricao || null;
    } else if (tipo === "gastos_pessoais") {
      const pagouEhSup = !!quemPagou && peopleOpts.sups.includes(quemPagou);
      if (pagouEhSup && recebedorModo === "gerentes") {
        if (gerentesSelecionados.length === 0) { setBusy(false); return toast.error("Selecione ao menos um gerente"); }
        const total = Number(valor) || 0;
        const por = total / gerentesSelecionados.length;
        const rows: TablesInsert<"lancamentos">[] = gerentesSelecionados.map((g) => ({
          formulario_id: id,
          data_hora: new Date().toISOString(),
          nome_recebedor: g,
          quem_pagou: quemPagou,
          gerente: quemPagou,
          valor: por,
          descricao: descricao || null,
          tipo_gasto: tipoGasto || null,
          destinacao: destinacaoFromTipoGasto(tipoGasto),
        }));
        const { error: insErr } = await supabase.from("lancamentos").insert(rows);
        setBusy(false);
        if (insErr) return toast.error(insErr.message);
        toast.success(`${rows.length} lançamento(s) criados`);
        setOpen(false);
        load();
        return;
      }
      payload.nome_recebedor = nome;
      payload.quem_pagou = quemPagou || null;
      payload.gerente = quemPagou || null;
      payload.valor = Number(valor) || 0;
      payload.descricao = descricao || null;
      payload.tipo_gasto = tipoGasto || null;
      payload.destinacao = destinacaoFromTipoGasto(tipoGasto);
    } else if (tipo === "contratacao") {
      payload.candidatos = candidatos === "" ? null : Number(candidatos);
      payload.contratados = contratados === "" ? null : Number(contratados);
      payload.fonte = fonte || null;
      payload.semana_inicio = contratacaoSemana || null;
      payload.gerente = gerente || null;
      payload.valor = 0;
    } else if (tipo === "meta") {
      payload.gerente = gerente || null;
      payload.valor = 0;
    } else if (tipo === "leads") {
      payload.superintendente = leadsSuper || null;
      payload.gerente = gerente || null;
      payload.leads = leadsQtd === "" ? null : Number(leadsQtd);
      payload.semana_inicio = leadsSemana || null;
      payload.mes_ref = Number(leadsMes);
      payload.ano_ref = Number(leadsAno);
      payload.produto = leadsProduto || null;
      payload.valor = 0;
    } else if (tipo === "planejamento" || tipo === "acelera_vendas") {
      if (planSecao === "principal") {
        let effectiveEditing = editingGerente;
        if (!effectiveEditing && gerente) {
          const dup = lancs.some(
            (x) => (x.secao || "principal") === "principal" && (x.gerente || "") === gerente,
          );
          if (dup) effectiveEditing = gerente;
        }
        if (effectiveEditing) {
          const { error: delErr } = await supabase
            .from("lancamentos")
            .delete()
            .eq("formulario_id", id)
            .eq("gerente", effectiveEditing)
            .or("secao.eq.principal,secao.is.null");
          if (delErr) { setBusy(false); return toast.error(delErr.message); }
        }
        const rows: TablesInsert<"lancamentos">[] = [];
        for (const p of plantoesList) {
          const v = planMetas[p] || { ger: "", sup: "" };
          if (v.ger === "" && v.sup === "") continue;
          rows.push({
            formulario_id: id,
            data_hora: new Date().toISOString(),
            secao: "principal",
            gerente: gerente || null,
            plantao: p,
            meta_gerente: v.ger === "" ? null : Number(v.ger),
            meta_sup: v.sup === "" ? null : Number(v.sup),
            valor: 0,
          });
        }
        if (rows.length === 0 && !effectiveEditing) { setBusy(false); return toast.error("Preencha ao menos um plantão"); }
        if (rows.length > 0) {
          const { error } = await supabase.from("lancamentos").insert(rows);
          if (error) { setBusy(false); return toast.error(error.message); }
        }
        setBusy(false);
        toast.success(effectiveEditing ? "Gerente atualizado" : `${rows.length} meta(s) lançada(s)`);
        setEditingGerente(null);
        setOpen(false);
        load();
        return;
      }
      if (planSecao === "acelera") {
        if (!gerente) { setBusy(false); return toast.error("Informe o gerente"); }
        let effectiveAcelera = editingAceleraGerente;
        if (!effectiveAcelera) {
          const dup = lancs.some((x) => x.secao === "acelera" && (x.gerente || "") === gerente);
          if (dup) effectiveAcelera = gerente;
        }
        if (effectiveAcelera) {
          const { error: delErr } = await supabase
            .from("lancamentos")
            .delete()
            .eq("formulario_id", id)
            .eq("gerente", effectiveAcelera)
            .eq("secao", "acelera");
          if (delErr) { setBusy(false); return toast.error(delErr.message); }
        }
        const rows: TablesInsert<"lancamentos">[] = [];
        for (const r of aceleraRows) {
          const v = Number(r.valor);
          if (!r.corretor.trim() || !ACELERA_PACOTES.includes(v as (typeof ACELERA_PACOTES)[number])) continue;
          const sp = aceleraSplit(v);
          rows.push({
            formulario_id: id,
            data_hora: new Date().toISOString(),
            secao: "acelera",
            gerente: gerente || null,
            superintendente: aceleraSup || null,
            nome_recebedor: r.corretor.trim(),
            valor: v,
            verba_cury: sp.corretor,
            verba_gerente: sp.gerente,
            verba_superintendente: sp.sup,
            meta_gerente: sp.diretor,
          });
        }
        if (rows.length === 0 && !effectiveAcelera) { setBusy(false); return toast.error("Preencha ao menos um corretor"); }
        if (rows.length > 0) {
          const { error } = await supabase.from("lancamentos").insert(rows);
          if (error) { setBusy(false); return toast.error(error.message); }
        }
        setBusy(false);
        toast.success(effectiveAcelera ? "Gerente atualizado" : `${rows.length} corretor(es) lançado(s)`);
        setEditingAceleraGerente(null);
        setOpen(false);
        load();
        return;
      }
      // Seção Verba — suporta edição
      if (!gerente) { setBusy(false); return toast.error("Informe o gerente"); }
      if (!editingVerbaId) {
        const dup = lancs.some((x) => x.secao === "verba" && (x.gerente || "") === gerente);
        if (dup) { setBusy(false); return toast.error("Este gerente já possui verba lançada. Use Editar."); }
      }
      const verbaPayload = {
        secao: "verba",
        gerente: gerente || null,
        plantao: planPlantao || null,
        valor: 0,
        verba_cury: planVerbaCury === "" ? null : Number(planVerbaCury),
        verba_gerente: planVerbaGer === "" ? null : Number(planVerbaGer),
        verba_superintendente: planVerbaSup === "" ? null : Number(planVerbaSup),
      };
      if (editingVerbaId) {
        const { error: updErr } = await supabase
          .from("lancamentos")
          .update(verbaPayload as never)
          .eq("id", editingVerbaId);
        setBusy(false);
        if (updErr) return toast.error(updErr.message);
        toast.success("Verba atualizada");
        setEditingVerbaId(null);
        setOpen(false);
        load();
        return;
      }
      Object.assign(payload, verbaPayload);
    }
    const { data: inserted, error } = await supabase
      .from("lancamentos")
      .insert(payload)
      .select()
      .single();
    if (error) { setBusy(false); return toast.error(error.message); }
    if (tipo === "meta" && arquivoMeta && inserted) {
      const ext = arquivoMeta.name.split(".").pop() || "bin";
      const path = `${id}/${inserted.id}/comprovante-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, arquivoMeta, { contentType: arquivoMeta.type });
      if (upErr) { setBusy(false); return toast.error(upErr.message); }
      await supabase.from("lancamentos").update({ comprovante_url: path }).eq("id", inserted.id);
    }
    setBusy(false);
    setOpen(false);
    load();
  };

  // ===== Leads: download modelo XLSX =====
  const baixarModeloLeads = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Leads");
    ws.addRow(["superintendente", "gerente", "produto", "leads", "semana_inicio", "mes", "ano"]);
    ws.addRow(["Ex: João Silva", "Ex: Maria Souza", "Ex: Cury Casa", 12, "2026-05-04", 5, 2026]);
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
    const out = await wb.xlsx.writeBuffer();
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "modelo-leads.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const importarLeadsXlsx = async (file: File) => {
    setImportBusy(true);
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Planilha vazia");
      // Mapeia cabeçalho
      const headers: Record<string, number> = {};
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell, col) => {
        const k = String(cell.value ?? "").trim().toLowerCase();
        if (k) headers[k] = col;
      });
      const need = ["superintendente", "gerente", "produto", "leads", "semana_inicio", "mes", "ano"];
      for (const n of need) if (!(n in headers)) throw new Error(`Coluna obrigatória ausente: ${n}`);
      const rows: TablesInsert<"lancamentos">[] = [];
      const gerentesSet = new Set(gerentes.map((g) => g.nome.toLowerCase()));
      let ignorados = 0;
      ws.eachRow((row, rowIdx) => {
        if (rowIdx === 1) return;
        const get = (k: string) => row.getCell(headers[k]).value;
        const sup = String(get("superintendente") ?? "").trim();
        const ger = String(get("gerente") ?? "").trim();
        const prod = String(get("produto") ?? "").trim();
        const qtd = Number(get("leads") ?? 0);
        const semRaw = get("semana_inicio");
        let sem = "";
        if (semRaw instanceof Date) {
          sem = `${semRaw.getFullYear()}-${String(semRaw.getMonth() + 1).padStart(2, "0")}-${String(semRaw.getDate()).padStart(2, "0")}`;
        } else if (semRaw) {
          sem = String(semRaw).trim();
        }
        const m = Number(get("mes") ?? 0);
        const a = Number(get("ano") ?? 0);
        if (!sup && !ger && !qtd) return; // linha vazia
        if (!ger || !gerentesSet.has(ger.toLowerCase())) { ignorados++; return; }
        rows.push({
          formulario_id: id,
          data_hora: new Date().toISOString(),
          superintendente: sup || null,
          gerente: ger || null,
          produto: prod || null,
          leads: Number.isFinite(qtd) ? qtd : null,
          semana_inicio: sem || null,
          mes_ref: Number.isFinite(m) && m > 0 ? m : null,
          ano_ref: Number.isFinite(a) && a > 0 ? a : null,
          valor: 0,
        });
      });
      if (rows.length === 0) throw new Error(ignorados > 0 ? `Nenhum gerente da planilha está cadastrado para este superintendente (${ignorados} linhas ignoradas)` : "Nenhuma linha válida encontrada");
      const { error } = await supabase.from("lancamentos").insert(rows);
      if (error) throw new Error(error.message);
      toast.success(`${rows.length} lançamento(s) importado(s)${ignorados > 0 ? ` — ${ignorados} ignorado(s) por gerente não cadastrado` : ""}`);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  const deleteLancamento = async (lancId: string) => {
    const { data: snap } = await supabase.from("lancamentos").select("*").eq("id", lancId);
    const { error } = await supabase.from("lancamentos").delete().eq("id", lancId);
    if (error) return toast.error(error.message);
    pushUndo("Lançamento excluído", [{ table: "lancamentos", rows: snap || [] }]);
    load();
  };

  const deletePlanejamentoGerente = async (gerenteNome: string) => {
    const { data: snap } = await supabase.from("lancamentos").select("*").eq("formulario_id", id).eq("gerente", gerenteNome);
    const { error } = await supabase.from("lancamentos").delete().eq("formulario_id", id).eq("gerente", gerenteNome);
    if (error) return toast.error(error.message);
    pushUndo(`Planejamento de ${gerenteNome} excluído`, [{ table: "lancamentos", rows: snap || [] }]);
    toast.success("Lançamentos do gerente excluídos com sucesso.");
    load();
  };

  const updateStatus = async (status: Form["status"]) => {
    const { error } = await supabase.from("formularios").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    const labels: Record<string, string> = { editando: "Voltou para edição", finalizado: "Verba finalizada", validado: "Verba validada", reprovado: "Verba reprovada" };
    toast.success(labels[status]);
    // Notificação por e-mail (assíncrona, não bloqueia)
    if ((status === "validado" || status === "reprovado") && (form?.tipo === "verba_cury")) {
      notifyVerbaStatus({ data: { formularioId: id!, status } })
        .then((r: { ok?: boolean; skipped?: boolean; error?: string }) => {
          if (!r?.ok && !r?.skipped) console.warn("[verba email] falha:", r?.error);
        })
        .catch((e: unknown) => console.warn("[verba email] erro:", e));
    }
    load();
  };

  const marcarLancamento = async (lancId: string, reprovado: boolean, motivo?: string) => {
    const { error } = await supabase
      .from("lancamentos")
      .update({ reprovado, motivo_reprovacao: reprovado ? (motivo || null) : null })
      .eq("id", lancId);
    if (error) return toast.error(error.message);
    toast.success(reprovado ? "Lançamento marcado como incorreto" : "Lançamento marcado como correto");
    load();
  };

  const reprovarComMotivo = (lancId: string) => {
    setReprovarLancId(lancId);
    setReprovarMotivo("");
    setReprovarOpen(true);
  };

  const handleReprovar = async () => {
    if (!reprovarLancId) return;
    await marcarLancamento(reprovarLancId, true, reprovarMotivo.trim() || "Sem motivo informado");
    setReprovarOpen(false);
    setReprovarLancId(null);
    setReprovarMotivo("");
  };

  const triggerUpload = (lancId: string, tipo: AnexoTipo) => {
    targetRef.current = { lancId, tipo };
    const useBoleto = tipo === "boleto" || tipo === "boleto_diretor";
    (useBoleto ? boletoInputRef : compInputRef).current?.click();
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
    const oldPath = lanc?.[col];
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
    const path = lanc?.[col];
    if (!path) return;
    const { error } = await supabase.from("lancamentos").update({ [col]: null } as never).eq("id", lancId);
    if (error) return toast.error(error.message);
    await supabase.storage.from(BUCKET).remove([path]);
    toast.success("Anexo removido");
    load();
  };

  const fetchAsBytes = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(error?.message || "Erro ao baixar arquivo");
    return new Uint8Array(await data.arrayBuffer());
  };

  const appendToPdf = async (pdf: PDFDocument, bytes: Uint8Array, filename: string) => {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".pdf")) {
      const src = await PDFDocument.load(bytes);
      const pages = await pdf.copyPages(src, src.getPageIndices());
      pages.forEach((p) => pdf.addPage(p));
    } else {
      let img;
      if (lower.endsWith(".png")) img = await pdf.embedPng(bytes);
      else img = await pdf.embedJpg(bytes);
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
  };

  const visualizarUnificado = async (lanc: Lancamento) => {
    if (!lanc.comprovante_url && !lanc.boleto_url) {
      return toast.error("Nenhum documento anexado");
    }
    setGeneratingId(lanc.id);
    try {
      const pdf = await PDFDocument.create();
      if (lanc.comprovante_url) {
        const bytes = await fetchAsBytes(lanc.comprovante_url);
        await appendToPdf(pdf, bytes, lanc.comprovante_url);
      }
      if (lanc.boleto_url) {
        const bytes = await fetchAsBytes(lanc.boleto_url);
        await appendToPdf(pdf, bytes, lanc.boleto_url);
      }
      const out = await pdf.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGeneratingId(null);
    }
  };

  const baixarTodosAnexos = async () => {
    const itens = (lancsView.length ? lancsView : lancs).filter(
      (l) => l.comprovante_url || l.boleto_url,
    );
    if (itens.length === 0) return toast.error("Nenhum anexo para baixar");
    setDownloadingAll(true);
    try {
      const pdf = await PDFDocument.create();
      for (const l of itens) {
        if (l.comprovante_url) {
          const bytes = await fetchAsBytes(l.comprovante_url);
          await appendToPdf(pdf, bytes, l.comprovante_url);
        }
        if (l.boleto_url) {
          const bytes = await fetchAsBytes(l.boleto_url);
          await appendToPdf(pdf, bytes, l.boleto_url);
        }
      }
      const out = await pdf.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anexos-${form?.nome || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download iniciado");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloadingAll(false);
    }
  };

  const baixarLancamentosExcel = async () => {
    if (lancs.length === 0) return toast.error("Nenhum lançamento para exportar");
    const tipoForm = form?.tipo || "verba_cury";
    const mesNome = form?.mes_referencia ? MESES[form.mes_referencia - 1] : "—";
    const refLabel = `${mesNome}/${form?.ano_referencia ?? "—"}`;

    // Layout customizado para Verba Cury
    if (tipoForm === "verba_cury") {
      try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Verba Cury");

        // Paleta: verde, preto e azul escuro
        const BLUE = "FF0B1E3F";       // azul escuro (cabeçalhos)
        const BLUE_SOFT = "FF13294B";  // azul escuro labels
        const GREEN = "FF059669";      // verde (total / saldo positivo)
        const PINK = "FF111111";       // preto (saldo negativo / destaque)
        const PINK_SOFT = "FFE8F5EE";  // verde pálido (zebra)
        const LIGHT = "FF1F2937";      // bordas
        const WHITE = "FFFFFFFF";

        const setLabelValue = (
          range: string,
          label: string,
          value: string,
          opts?: { fill?: string; color?: string },
        ) => {
          ws.mergeCells(range);
          const cell = ws.getCell(range.split(":")[0]);
          cell.value = {
            richText: [
              { text: `${label}\n`, font: { bold: true, size: 10, color: { argb: opts?.color || WHITE } } },
              { text: value, font: { bold: false, size: 12, color: { argb: opts?.color || WHITE } } },
            ],
          } as ExcelJS.CellValue;
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts?.fill || BLUE_SOFT } };
          cell.border = {
            top: { style: "thin", color: { argb: BLUE } },
            bottom: { style: "thin", color: { argb: BLUE } },
            left: { style: "thin", color: { argb: BLUE } },
            right: { style: "thin", color: { argb: BLUE } },
          };
        };

        // Larguras (A–E)
        ws.columns = [
          { width: 24 }, { width: 24 }, { width: 28 },
          { width: 18 }, { width: 20 },
        ];

        // Linha 1 — título único: VERBA CURY - SUPERINTENDENTE - MES/ANO
        ws.mergeCells("A1:E1");
        const title = ws.getCell("A1");
        title.value = `VERBA CURY - QUEM PRESTOU VERBA - ${refLabel.toUpperCase()}`;
        title.font = { bold: true, size: 16, color: { argb: WHITE } };
        title.alignment = { vertical: "middle", horizontal: "center" };
        title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
        ws.getRow(1).height = 30;

        // Linha 2 — Verba Agilitas (A:B) | Verba Marketing (C:D) | Verba Total (E)
        const vAgil = Number(form?.valor_agilitas || 0);
        const vMkt = Number(form?.valor_marketing || 0);
        const vTot = vAgil + vMkt;
        setLabelValue("A2:B2", "Verba Agilitas", brl(vAgil));
        setLabelValue("C2:D2", "Verba Marketing", brl(vMkt));
        setLabelValue("E2:E2", "Verba Total", brl(vTot), { fill: GREEN });
        ws.getRow(2).height = 30;

        // Linha 3 — Valor prestado (A:B) | Saldo (D:E)
        const prestado = lancs.reduce((s, l) => s + Number(l.valor), 0);
        const saldo = vTot - prestado;
        setLabelValue("A3:D3", "Valor prestado", brl(prestado));
        setLabelValue("E3:E3", "Saldo Total", brl(saldo), {
          fill: saldo < 0 ? PINK : GREEN,
        });
        ws.getRow(3).height = 30;

        // Linha 5 — cabeçalho da tabela
        const headers = ["Quem recebeu", "Descrição", "Data", "Hora", "Valor"];
        headers.forEach((h, i) => {
          const c = ws.getCell(5, i + 1);
          c.value = h;
          c.font = { bold: true, color: { argb: WHITE }, size: 11 };
          c.alignment = { vertical: "middle", horizontal: "center" };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
          c.border = {
            top: { style: "thin", color: { argb: BLUE } },
            bottom: { style: "thin", color: { argb: BLUE } },
            left: { style: "thin", color: { argb: BLUE } },
            right: { style: "thin", color: { argb: BLUE } },
          };
        });
        ws.getRow(5).height = 20;

        // Linhas 9+ — lançamentos na ordem em que aparecem no projeto
        const ordered = lancsView.length ? [...lancsView] : [...lancs];
        ordered.forEach((l, idx) => {
          const r = 6 + idx;
          ws.getRow(r).height = 16;
          const recebedor = l.gerente || l.superintendente || l.nome_recebedor || form?.superintendente || "—";
          const values = [
            recebedor,
            l.descricao || "",
            fmtDate(l.data_hora),
            fmtTime(l.data_hora),
            Number(l.valor),
          ];
          values.forEach((v, i) => {
            const c = ws.getCell(r, i + 1);
            c.value = v as ExcelJS.CellValue;
            c.alignment = {
              vertical: "middle",
              horizontal: i === 4 ? "right" : i === 1 ? "left" : "center",
              wrapText: i === 1,
            };
            c.border = {
              top: { style: "thin", color: { argb: LIGHT } },
              bottom: { style: "thin", color: { argb: LIGHT } },
              left: { style: "thin", color: { argb: LIGHT } },
              right: { style: "thin", color: { argb: LIGHT } },
            };
            if (idx % 2 === 1) {
              c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PINK_SOFT } };
            }
            if (i === 4) {
              c.numFmt = '"R$" #,##0.00';
              c.font = { bold: true, color: { argb: GREEN } };
            }
          });
        });

        // Linha de total
        const totalRow = 6 + ordered.length;
        ws.mergeCells(totalRow, 1, totalRow, 4);
        const tl = ws.getCell(totalRow, 1);
        tl.value = "TOTAL PRESTADO";
        tl.font = { bold: true, color: { argb: WHITE } };
        tl.alignment = { vertical: "middle", horizontal: "right" };
        tl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
        const tv = ws.getCell(totalRow, 5);
        tv.value = prestado;
        tv.numFmt = '"R$" #,##0.00';
        tv.font = { bold: true, color: { argb: WHITE } };
        tv.alignment = { vertical: "middle", horizontal: "right" };
        tv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
        ws.getRow(totalRow).height = 20;

        const out = await wb.xlsx.writeBuffer();
        const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `verba-cury-${form?.nome || id}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Excel gerado");
      } catch (err) {
        console.error("Erro ao gerar excel:", err);
        toast.error((err as Error).message || "Erro ao gerar excel");
      }
      return;
    }

    const rows = lancs.map((l) => {
      const base: Record<string, unknown> = {
        "Data": fmtDate(l.data_hora),
        "Hora": fmtTime(l.data_hora),
      };
      if (tipoForm === "gastos_pessoais") {
        base["Gerente"] = l.quem_pagou || "";
        base["Quem recebeu"] = l.nome_recebedor || "";
        base["Valor"] = Number(l.valor);
        base["Tipo de gasto"] = l.tipo_gasto || "";
        base["Descrição"] = l.descricao || "";
      } else if (tipoForm === "contratacao") {
        base["Candidatos"] = l.candidatos ?? "";
        base["Contratados"] = l.contratados ?? "";
        base["Fonte"] = l.fonte || "";
        base["Semana"] = l.semana_inicio ? fmtDate(l.semana_inicio) : "";
      } else if (tipoForm === "meta") {
        base["Gerente"] = l.gerente || "";
      } else if (tipoForm === "leads") {
        base["Superintendente"] = l.superintendente || "";
        base["Gerente"] = l.gerente || "";
        base["Produto"] = l.produto || "";
        base["Leads"] = l.leads ?? "";
        base["Semana início"] = l.semana_inicio ? fmtDate(l.semana_inicio) : "";
        base["Mês"] = l.mes_ref ? `${String(l.mes_ref).padStart(2, "0")}/${l.ano_ref ?? ""}` : "";
      }
      base["Status"] = l.reprovado ? "Reprovado" : "OK";
      if (l.reprovado) base["Motivo reprovação"] = l.motivo_reprovacao || "";
      return base;
    });
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Lançamentos");
      // Mini cabeçalho com informações da prestação
      const headerLines: Array<[string, string]> = [
        ["Tipo", tipoLabel(tipoForm)],
        ["Prestação", form?.nome || "—"],
        ["Diretor", form?.diretor || "—"],
        ["Superintendente", form?.superintendente || "—"],
        ["Responsável", form?.responsavel || "—"],
        ["Referência", refLabel],
        ["Status", form?.status || "—"],
      ];
      headerLines.push(["Gerado em", fmtDateTime(new Date().toISOString())]);
      headerLines.forEach(([k, v]) => {
        const row = ws.addRow([k, v]);
        row.getCell(1).font = { bold: true };
      });
      ws.addRow([]);
      const headers = Array.from(
        rows.reduce((set, r) => {
          Object.keys(r).forEach((k) => set.add(k));
          return set;
        }, new Set<string>())
      );
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      });
      rows.forEach((r) => ws.addRow(headers.map((h) => r[h] ?? "")));
      ws.columns.forEach((col) => { col.width = 22; });
      const out = await wb.xlsx.writeBuffer();
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lancamentos-${form?.nome || id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel gerado");
    } catch (err) {
      console.error("Erro ao gerar excel:", err);
      toast.error((err as Error).message || "Erro ao gerar excel");
    }
  };

  if (!form) return <p className="text-muted-foreground">Carregando…</p>;

  const tipo = form.tipo || "verba_cury";
  const isVerba = tipo === "verba_cury";
  const isCyber = isVerba || tipo === "planejamento" || tipo === "gastos_pessoais" || tipo === "contratacao";
  const gerentesDisponiveis = Array.from(new Set(lancs.map((l) => l.gerente).filter(Boolean) as string[])).sort();
  const lancsAll = lancs;
  const lancsView = filtroGerente === "todos" ? lancsAll : lancsAll.filter((l) => (l.gerente || "") === filtroGerente);
  const valorTotal = Number(form.valor_agilitas) + Number(form.valor_marketing);
  const valorPrestado = lancsView.reduce((s, l) => s + Number(l.valor), 0);
  const valorReprovado = lancsView.filter((l) => l.reprovado).reduce((s, l) => s + Number(l.valor), 0);
  const saldo = valorTotal - valorPrestado;
  const saldoDisponivel = valorTotal - (valorPrestado - valorReprovado);
  const isLocked = form.status !== "editando";
  const isValidated = form.status === "validado";
  const isFinalDecision = form.status === "validado" || form.status === "reprovado";
  const canEditLancamentos = !isLocked || isAdmin;
  const canValidateLancamentos = isAdmin && !isFinalDecision;
  // Perfil "diretor" é somente leitura: pode validar/reprovar, mas não pode criar, editar nem excluir.
  const canEdit = !isDiretor;
  const canEditWrite = canEditLancamentos && canEdit;
  // Acelera Vendas: comprovantes/boleto só podem ser anexados após o admin validar o formulário.
  const canUploadAcelera = tipo === "acelera_vendas" && isValidated;

  return (
    <div
      className={
        isCyber
          ? "verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10 space-y-6"
          : "space-y-6"
      }
    >
      {isCyber && <CyberBackdrop />}
      <div className={isCyber ? "relative z-10 space-y-6" : "contents"}>
      <input ref={compInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
      <input ref={boletoInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />

      <Link to="/dashboard" search={{ tipo: form.tipo }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
      </Link>

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          {tipo !== "contratacao" && tipo !== "planejamento" && <h1 className={`${isCyber && tipo === "gastos_pessoais" ? "text-[10px] font-bold" : "text-2xl font-semibold"} ${isCyber ? "text-[#39FF14] uppercase tracking-[0.25em]" : ""}`}>
            {isCyber
              ? (tipoLabel(tipo).toUpperCase().startsWith("//") ? tipoLabel(tipo).toUpperCase() : `// ${tipoLabel(tipo).toUpperCase()}`)
              : (form.nome || "Prestação")}
          </h1>}
          {!isCyber && <Badge variant="outline" className="text-xs">{tipoLabel(tipo)}</Badge>}
          {form.status === "finalizado" && (
            <Badge variant="secondary" className={isCyber ? "rounded-none bg-black border border-orange-500 text-orange-400 uppercase tracking-widest text-[10px]" : "bg-orange-100 text-orange-700"}><Lock className="mr-1 h-3 w-3" />Finalizado</Badge>
          )}
          {form.status === "validado" && (
            <Badge className={isCyber ? "rounded-none bg-black border border-[#39FF14] text-[#39FF14] uppercase tracking-widest text-[10px]" : "bg-emerald-600"}><CheckCircle2 className="mr-1 h-3 w-3" />Validado</Badge>
          )}
          {form.status === "reprovado" && (
            <Badge variant="destructive" className={isCyber ? "rounded-none bg-black border border-red-500 text-red-500 uppercase tracking-widest text-[10px]" : ""}><XCircle className="mr-1 h-3 w-3" />Reprovado</Badge>
          )}
        </div>
        {tipo !== "contratacao" && tipo !== "planejamento" && (
          <>
            {isCyber && form.nome && tipo !== "gastos_pessoais" && (
              <p className="text-sm text-gray-400 uppercase tracking-widest mt-2">{form.nome}</p>
            )}
            <p className={`text-sm ${isCyber ? "text-gray-500 uppercase tracking-widest text-[11px] mt-1" : "text-muted-foreground"}`}>
              Criado em {fmtDateTime(form.created_at)}
              {form.mes_referencia && form.ano_referencia && ` · Ref: ${MESES[form.mes_referencia - 1]}/${form.ano_referencia}`}
            </p>
            {(form.diretor || form.superintendente) && (
              <p className="text-sm text-muted-foreground mt-1">
                {form.diretor && <>Diretor: <span className="text-foreground">{form.diretor}</span></>}
                {form.diretor && form.superintendente && " · "}
                {form.superintendente && <>Superintendente: <span className="text-foreground">{form.superintendente}</span></>}
              </p>
            )}
            {form.responsavel && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className={isCyber && tipo === "gastos_pessoais" ? "text-green-500 font-semibold" : ""}>Responsável:</span> <span className={isCyber && tipo === "gastos_pessoais" ? "text-green-500" : "text-foreground"}>{form.responsavel}</span>
              </p>
            )}
          </>
        )}
        {tipo === "contratacao" && (
          <p className="text-sm text-gray-500 uppercase tracking-widest text-[11px] mt-1">
            {form.mes_referencia && form.ano_referencia && (
              <>Ref: {MESES[form.mes_referencia - 1]}/{form.ano_referencia}</>
            )}
            {form.mes_referencia && form.ano_referencia && (form.responsavel || form.nome) && " · "}
            {(form.responsavel || form.nome) && (
              <>Responsável: <span className="text-[#39FF14]">{form.responsavel || form.nome}</span></>
            )}
            {form.diretor && <> · Diretoria: <span className="text-foreground">{form.diretor}</span></>}
          </p>
        )}
        {tipo === "planejamento" && (
          <p className="mt-1 text-[11px] uppercase tracking-widest text-gray-500">
            {form.mes_referencia && form.ano_referencia && <>Ref: {MESES[form.mes_referencia - 1]}/{form.ano_referencia}</>}
            {(form.responsavel || form.nome) && <> · Responsável: <span className="text-[#39FF14]">{form.responsavel || form.nome}</span></>}
            {form.diretor && <> · Diretoria: <span className="text-white/70">{form.diretor}</span></>}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tipo !== "contratacao" && !isValidated && form.status === "editando" && (canEdit || isDiretor) && (
          <Button variant="default" className={isCyber ? "rounded-none bg-black border border-orange-500 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 uppercase tracking-widest text-[11px]" : "bg-orange-600 hover:bg-orange-700"} onClick={() => updateStatus("finalizado")}>
            <Lock className="mr-1 h-4 w-4" /> Finalizado
          </Button>
        )}
        {tipo !== "contratacao" && !isValidated && form.status === "finalizado" && (canEdit || isDiretor) && (
          <Button variant="outline" onClick={() => updateStatus("editando")}>
            <Pencil className="mr-1 h-4 w-4" /> Voltar a editar
          </Button>
        )}
        {(tipo === "planejamento" || tipo === "verba_cury") && form.status === "reprovado" && canEdit && (
          <Button variant="outline" onClick={() => updateStatus("editando")}>
            <Pencil className="mr-1 h-4 w-4" /> Voltar a editar
          </Button>
        )}
        {(tipo === "planejamento" || tipo === "verba_cury") && form.status === "validado" && isAdmin && canEdit && (
          <Button variant="outline" onClick={() => updateStatus("editando")}>
            <Pencil className="mr-1 h-4 w-4" /> Voltar a editar
          </Button>
        )}
        {tipo !== "contratacao" && isDiretor && (form.status === "validado" || form.status === "reprovado") && (
          <Button variant="outline" onClick={() => updateStatus("editando")}>
            <Pencil className="mr-1 h-4 w-4" /> Voltar a editar
          </Button>
        )}
        {tipo !== "contratacao" && isAdmin && form.status !== "validado" && form.status !== "reprovado" && (
          <Button className={isCyber ? "rounded-none bg-black border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14]/10 uppercase tracking-widest text-[11px]" : "bg-emerald-600 hover:bg-emerald-700"} onClick={() => updateStatus("validado")}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Validado
          </Button>
        )}
        {tipo !== "contratacao" && isAdmin && form.status !== "validado" && form.status !== "reprovado" && (
          <Button variant="destructive" className={isCyber ? "rounded-none bg-black border border-red-500 text-red-500 hover:bg-red-500/10 hover:text-red-400 uppercase tracking-widest text-[11px]" : ""} onClick={() => updateStatus("reprovado")}>
            <XCircle className="mr-1 h-4 w-4" /> Reprovado
          </Button>
        )}
        {tipo !== "gastos_pessoais" && tipo !== "contratacao" && tipo !== "planejamento" && (peopleOpts.sups.length + peopleOpts.gers.length + gerentesDisponiveis.length) > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Filtrar Gerente</Label>
            <Select value={filtroGerente} onValueChange={setFiltroGerente}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Gerente" /></SelectTrigger>
              <SelectContent>
                {(peopleOpts.sups.length + peopleOpts.gers.length) > 0 ? (
                  <PessoaSelectContentItems opts={peopleOpts} includeTodos />
                ) : (
                  <>
                    <SelectItem value="todos">Todos</SelectItem>
                    {gerentesDisponiveis.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}
        {(tipo === "contratacao" || tipo === "planejamento") && (peopleOpts.sups.length + peopleOpts.gers.length + gerentesDisponiveis.length) > 0 && (
          <div className="relative ml-auto">
            <button
              type="button"
              aria-expanded={filtrosContratacaoAbertos}
              onClick={() => setFiltrosContratacaoAbertos((aberto) => !aberto)}
              className="flex h-9 items-center gap-2 border border-[#39FF14]/40 bg-black/70 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#39FF14] transition hover:border-[#39FF14] hover:bg-[#39FF14]/10"
            >
              <span className="relative block h-4 w-6" aria-hidden>
                <span className={`absolute top-1/2 h-[2px] w-3.5 bg-current transition duration-300 ${filtrosContratacaoAbertos ? "left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" : "left-[22%] -translate-x-1/2 -translate-y-1/2 -rotate-[65deg]"}`} />
                <span className={`absolute top-1/2 h-[2px] w-3.5 bg-current transition duration-300 ${filtrosContratacaoAbertos ? "left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" : "left-[78%] -translate-x-1/2 -translate-y-1/2 -rotate-[65deg]"}`} />
              </span>
              Filtro
            </button>
            <div className={`absolute right-0 top-[calc(100%+10px)] z-50 w-72 border border-[#39FF14]/35 bg-black/95 p-4 shadow-[0_0_35px_rgba(57,255,20,0.12)] backdrop-blur-2xl transition-all ${filtrosContratacaoAbertos ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}>
              <div className="mb-3 border-b border-[#39FF14]/20 pb-2 text-[9px] uppercase tracking-[0.25em] text-white/40">/ / FILTRAR LANÇAMENTOS</div>
              <Select value={filtroGerente} onValueChange={(valor) => { setFiltroGerente(valor); setFiltrosContratacaoAbertos(false); }}>
                <SelectTrigger className="w-full rounded-none border border-[#39FF14]/30 bg-black/70 text-[10px] uppercase tracking-widest text-gray-300"><SelectValue placeholder="RESPONSÁVEL" /></SelectTrigger>
                <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/95 text-gray-300">
                  {(peopleOpts.sups.length + peopleOpts.gers.length) > 0 ? <PessoaSelectContentItems opts={peopleOpts} includeTodos cyber /> : <><SelectItem value="todos">TODOS</SelectItem>{gerentesDisponiveis.map((gerenteItem) => <SelectItem key={gerenteItem} value={gerenteItem}>{gerenteItem.toUpperCase()}</SelectItem>)}</>}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <Button
          className={`${tipo === "contratacao" || tipo === "planejamento" ? "" : "ml-auto"} rounded-none bg-transparent border border-[#39FF14] text-[#39FF14] hover:!bg-[#39FF14] hover:!text-black [&_svg]:hover:!text-black font-bold uppercase tracking-widest text-xs transition-colors duration-200`}
          onClick={openDialog}
          disabled={!canEditWrite || (tipo === "acelera_vendas" && planejamentoValidado)}
        >
          <Plus className="mr-1 h-4 w-4" /> LANÇAMENTO
        </Button>
      </div>

      {tipo === "gastos_pessoais" && (peopleOpts.sups.length + peopleOpts.gers.length + gerentesDisponiveis.length) > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-[10px] uppercase tracking-widest text-[#39FF14]">Filtrar Quem recebeu</Label>
          <Select value={filtroGerente} onValueChange={setFiltroGerente}>
            <SelectTrigger className="w-[220px] rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]">
              <SelectValue placeholder="QUEM RECEBEU" />
            </SelectTrigger>
            <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
              {(peopleOpts.sups.length + peopleOpts.gers.length) > 0 ? (
                <PessoaSelectContentItems opts={peopleOpts} includeTodos cyber />
              ) : (
                <>
                  <SelectItem value="todos" className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10">TODOS</SelectItem>
                  {gerentesDisponiveis.map((g) => (
                    <SelectItem key={g} value={g} className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10">{g.toUpperCase()}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {form.status === "reprovado" && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2 text-destructive font-semibold">
              <AlertTriangle className="h-4 w-4" /> Lançamentos reprovados
            </div>
            {lancsView.filter((l) => l.reprovado).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lançamento foi marcado como incorreto. Marque-os abaixo usando o botão vermelho.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lancsView.filter((l) => l.reprovado).map((l) => (
                  <li key={l.id} className="flex flex-col">
                    <span className="font-medium">{l.nome_recebedor} — {brl(Number(l.valor))}</span>
                    {l.motivo_reprovacao && <span className="text-muted-foreground">Motivo: {l.motivo_reprovacao}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {isVerba && (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Card className="border border-[#39FF14]/40 bg-white/5 backdrop-blur-md rounded-none">
            <CardContent className="pt-6">
              <div className="text-xs text-[#39FF14] uppercase tracking-widest">Verba Agilitas</div>
              <div className="text-2xl font-semibold text-gray-400">{brl(Number(form.valor_agilitas) || 0)}</div>
            </CardContent>
          </Card>
          <Card className="border border-[#39FF14]/40 bg-white/5 backdrop-blur-md rounded-none">
            <CardContent className="pt-6">
              <div className="text-xs text-[#39FF14] uppercase tracking-widest">Verba Marketing</div>
              <div className="text-2xl font-semibold text-gray-400">{brl(Number(form.valor_marketing) || 0)}</div>
            </CardContent>
          </Card>
          <Card className="border border-[#39FF14]/40 bg-white/5 backdrop-blur-md rounded-none">
            <CardContent className="pt-6">
              <div className="text-xs text-[#39FF14] uppercase tracking-widest">Total</div>
              <div className="text-2xl font-semibold text-gray-400">{brl(valorTotal)}</div>
            </CardContent>
          </Card>
          <Card className="border border-[#39FF14]/40 bg-white/5 backdrop-blur-md rounded-none">
            <CardContent className="pt-6">
              <div className="text-xs text-[#39FF14] uppercase tracking-widest">Utilizado</div>
              <div className={`text-2xl font-semibold ${valorPrestado <= valorTotal ? "text-[#39FF14]" : "text-red-500"}`}>{brl(valorPrestado)}</div>
            </CardContent>
          </Card>
          <Card className="border border-[#39FF14]/40 bg-white/5 backdrop-blur-md rounded-none">
            <CardContent className="pt-6">
              <div className="text-xs text-[#39FF14] uppercase tracking-widest">Saldo</div>
              <div className={`text-2xl font-semibold ${saldo < 0 ? "text-red-500" : saldo > 0.01 ? "text-yellow-400" : "text-[#39FF14]"}`}>{brl(saldo)}</div>
            </CardContent>
          </Card>
        </div>
      )}
      {tipo === "contratacao" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">/ / RESUMO</h2>
            <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">{lancsView.length} {lancsView.length === 1 ? "lançamento" : "lançamentos"}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-none border border-white/10 bg-black/55 p-4 backdrop-blur-md">
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-[0.2em]">Candidatos</div>
              <div className="mt-1 font-mono text-xl font-bold text-white">{lancsView.reduce((s, l) => s + (Number(l.candidatos) || 0), 0)}</div>
            </div>
            <div className="rounded-none border border-[#39FF14]/35 bg-[#39FF14]/[0.045] p-4 backdrop-blur-md">
              <div className="text-[9px] font-medium text-[#39FF14]/70 uppercase tracking-[0.2em]">Contratados</div>
              <div className="mt-1 font-mono text-xl font-bold text-[#39FF14]">{lancsView.reduce((s, l) => s + (Number(l.contratados) || 0), 0)}</div>
            </div>
            <div className="rounded-none border border-white/10 bg-black/55 p-4 backdrop-blur-md">
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-[0.2em]">Conversão</div>
              <div className="mt-1 font-mono text-xl font-bold text-white">
                {(() => {
                  const candidatosTotal = lancsView.reduce((s, l) => s + (Number(l.candidatos) || 0), 0);
                  const contratadosTotal = lancsView.reduce((s, l) => s + (Number(l.contratados) || 0), 0);
                  return `${(candidatosTotal > 0 ? (contratadosTotal / candidatosTotal) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
      {tipo === "contratacao" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">/ / LANÇAMENTOS</h2>
            <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">{lancsView.length} registros</span>
          </div>
          {lancsView.length === 0 ? (
            <div className="border border-dashed border-white/15 bg-black/45 py-10 text-center text-xs text-white/40">Nenhum lançamento ainda</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lancsView.map((lancamento) => {
                const candidatosLancamento = Number(lancamento.candidatos) || 0;
                const contratadosLancamento = Number(lancamento.contratados) || 0;
                const conversaoLancamento = candidatosLancamento > 0 ? (contratadosLancamento / candidatosLancamento) * 100 : 0;
                const semanaLabel = lancamento.semana_inicio ? (() => {
                  const [anoSemana, mesSemana, diaSemana] = lancamento.semana_inicio.split("-").map(Number);
                  const inicioSemana = new Date(anoSemana, mesSemana - 1, diaSemana);
                  const fimSemana = new Date(anoSemana, mesSemana - 1, diaSemana + 6);
                  return `${fmtDate(inicioSemana.toISOString())} a ${fmtDate(fimSemana.toISOString())}`;
                })() : "Sem semana";
                return (
                  <div key={lancamento.id} className="relative border border-[#39FF14]/25 bg-black/55 p-4 backdrop-blur-md transition hover:border-[#39FF14]/60">
                    <div className="border-b border-white/10 pb-3 pr-8">
                      <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">Responsável</div>
                      <h3 className="mt-1 text-sm font-bold uppercase tracking-wider text-[#39FF14]">{lancamento.gerente || "Sem responsável"}</h3>
                      <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-white/35">{lancamento.fonte || "Sem fonte"} · {semanaLabel}</div>
                    </div>
                    <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.14em]">
                      <div className="flex items-center justify-between border border-white/10 p-2"><span className="text-white/45">Candidatos</span><span className="font-mono text-sm font-bold text-white">{candidatosLancamento}</span></div>
                      <div className="flex items-center justify-between border border-white/10 p-2"><span className="text-white/45">Contratados</span><span className="font-mono text-sm font-bold text-white">{contratadosLancamento}</span></div>
                      <div className="flex items-center justify-between border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-2"><span className="text-[#39FF14]/65">Conversão</span><span className="font-mono text-sm font-bold text-[#39FF14]">{conversaoLancamento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span></div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" disabled={!canEditWrite} aria-label="Excluir lançamento" className="absolute right-3 top-3 text-red-400/60 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="verba-cyber rounded-none border border-red-500/40 bg-black/95 text-white">
                        <AlertDialogHeader><AlertDialogTitle className="text-sm uppercase tracking-[0.2em] text-red-400">/ / EXCLUIR LANÇAMENTO?</AlertDialogTitle><AlertDialogDescription className="text-white/50">Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel className="rounded-none border-white/20 bg-transparent text-white">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteLancamento(lancamento.id)} className="rounded-none border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-black">Excluir</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {tipo === "gastos_pessoais" && (
        (() => {
          const totGerarVenda = lancsView
            .filter((l) => (l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto)) === "Gerar Venda")
            .reduce((s, l) => s + Number(l.valor || 0), 0);
          const totManut = lancsView
            .filter((l) => (l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto)) === "Manutencao")
            .reduce((s, l) => s + Number(l.valor || 0), 0);
          const totLanc = lancsView.reduce((s, l) => s + Number(l.valor || 0), 0);
          return (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-none border border-[#39FF14]/60 bg-black/60 backdrop-blur-md p-4 shadow-[0_0_30px_rgba(57,255,20,0.15)]">
                <div className="text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">Total Lançado</div>
                <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totLanc)}</div>
              </div>
              <div className="rounded-none border border-[#39FF14]/60 bg-black/60 backdrop-blur-md p-4 shadow-[0_0_30px_rgba(57,255,20,0.15)]">
                <div className="text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">Gerar Venda</div>
                <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totGerarVenda)}</div>
              </div>
              <div className="rounded-none border border-[#39FF14]/60 bg-black/60 backdrop-blur-md p-4 shadow-[0_0_30px_rgba(57,255,20,0.15)]">
                <div className="text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">Manutenção</div>
                <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totManut)}</div>
              </div>
              <div className="rounded-none border border-[#39FF14]/60 bg-black/60 backdrop-blur-md p-4 shadow-[0_0_30px_rgba(57,255,20,0.15)]">
                <div className="text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">LANÇAMENTOS</div>
                <div className="mt-1 text-2xl font-bold text-gray-300">{lancsView.length}</div>
              </div>
            </div>
          );
        })()
      )}
      {tipo === "leads" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total de Leads</div><div className="text-2xl font-semibold text-emerald-600">{lancsView.reduce((s, l) => s + (Number(l.leads) || 0), 0)}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Lançamentos</div><div className="text-2xl font-semibold">{lancsView.length}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Superintendentes</div><div className="text-2xl font-semibold">{new Set(lancsView.map((l) => l.superintendente).filter(Boolean)).size}</div></CardContent></Card>
        </div>
      )}

      <div className="flex flex-col gap-6">
      {tipo === "planejamento" && (() => {
        const grupos = new Map<string, { metaGerente: number; metaSup: number; verbaCury: number; investimentosPessoais: number; acelera: number; verbaRow?: Lancamento }>();
        lancsView.forEach((l) => {
          const gerenteNome = l.gerente || "Sem gerente";
          const grupo = grupos.get(gerenteNome) || { metaGerente: 0, metaSup: 0, verbaCury: 0, investimentosPessoais: 0, acelera: 0 };
          const secao = l.secao || "principal";
          if (secao === "principal") {
            grupo.metaGerente += Number(l.meta_gerente || 0);
            grupo.metaSup += Number(l.meta_sup || 0);
          } else if (secao === "verba") {
            grupo.verbaCury += Number(l.verba_cury || 0);
            grupo.investimentosPessoais += Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0);
            grupo.verbaRow ||= l;
          } else if (secao === "acelera") {
            grupo.acelera += Number(l.valor || 0);
          }
          grupos.set(gerenteNome, grupo);
        });
        const linhas = Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
        const totais = linhas.reduce((acc, [, linha]) => {
          acc.metaGerente += linha.metaGerente;
          acc.metaSup += linha.metaSup;
          acc.verbaCury += linha.verbaCury;
          acc.investimentosPessoais += linha.investimentosPessoais;
          acc.acelera += linha.acelera;
          return acc;
        }, { metaGerente: 0, metaSup: 0, verbaCury: 0, investimentosPessoais: 0, acelera: 0 });
        const totalInvestimentoGeral = totais.verbaCury + totais.investimentosPessoais + totais.acelera;
        return (
          <section className="order-2 space-y-3">
            <div className="flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
              <div><h2 className="text-sm font-bold uppercase tracking-[0.24em] text-[#39FF14]">/ / LANÇAMENTOS UNIFICADOS</h2><p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-white/35">Metas, verbas e Acelera Vendas consolidados por gerente</p></div>
              <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">{linhas.length} {linhas.length === 1 ? "gerente" : "gerentes"}</span>
            </div>
            <div className="overflow-x-auto border border-[#39FF14]/25 bg-black/55 backdrop-blur-md">
              <Table className="min-w-[1220px]">
                <TableHeader><TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-[#39FF14]">Gerente</TableHead>
                  <TableHead className="text-right text-[#39FF14]">Meta gerente</TableHead>
                  <TableHead className="text-right text-[#39FF14]">Meta SUP</TableHead>
                  <TableHead className="text-right text-[#39FF14]">Verba Cury</TableHead>
                  <TableHead className="text-right text-[#39FF14]">Investimentos pessoais</TableHead>
                  <TableHead className="text-right text-[#39FF14]">Acelera Vendas</TableHead>
                  <TableHead className="text-right text-[#39FF14]">Total de investimento</TableHead>
                  <TableHead className="text-right text-[#39FF14]">Custo por venda planejado</TableHead>
                  <TableHead className="w-28 text-right text-[#39FF14]">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {linhas.length === 0 ? <TableRow><TableCell colSpan={9} className="py-10 text-center text-white/40">Nenhum lançamento ainda</TableCell></TableRow> : linhas.map(([gerenteNome, linha]) => {
                    const totalInvestimento = linha.verbaCury + linha.investimentosPessoais + linha.acelera;
                    const custoPlanejado = totalInvestimento > 0 ? linha.metaSup / totalInvestimento : 0;
                    return <TableRow key={gerenteNome} className="border-white/10">
                      <TableCell className="font-bold uppercase tracking-wide text-white">{gerenteNome}</TableCell>
                      <TableCell className="text-right font-mono text-white">{linha.metaGerente.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-mono text-white">{linha.metaSup.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-mono text-white">{brl(linha.verbaCury)}</TableCell>
                      <TableCell className="text-right font-mono text-white">{brl(linha.investimentosPessoais)}</TableCell>
                      <TableCell className="text-right font-mono text-white">{brl(linha.acelera)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-[#39FF14]">{brl(totalInvestimento)}</TableCell>
                      <TableCell className="text-right font-mono text-white">{custoPlanejado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</TableCell>
                      <TableCell><div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" disabled={!canEditWrite || gerenteNome === "Sem gerente"} onClick={() => openEditPlanGerente(gerenteNome)} title="Editar metas"><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-400 hover:bg-red-500/10 hover:text-red-400" disabled={!canEditWrite || gerenteNome === "Sem gerente"}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent className="rounded-none border border-red-500/40 bg-black/95 text-white backdrop-blur-xl"><AlertDialogHeader><AlertDialogTitle className="text-sm uppercase tracking-[0.2em] text-red-400">/ / EXCLUIR LANÇAMENTOS?</AlertDialogTitle><AlertDialogDescription className="text-xs text-white/50">Todos os lançamentos de {gerenteNome} neste planejamento serão removidos. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-none border-white/20 bg-transparent text-white">Cancelar</AlertDialogCancel><AlertDialogAction className="rounded-none border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-black" onClick={() => deletePlanejamentoGerente(gerenteNome)}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </div></TableCell>
                    </TableRow>;
                  })}
                  {linhas.length > 0 && <TableRow className="border-t border-[#39FF14]/30 bg-[#39FF14]/[0.035] font-bold"><TableCell className="text-[#39FF14]">TOTAL</TableCell><TableCell className="text-right font-mono text-white">{totais.metaGerente.toLocaleString("pt-BR")}</TableCell><TableCell className="text-right font-mono text-white">{totais.metaSup.toLocaleString("pt-BR")}</TableCell><TableCell className="text-right font-mono text-white">{brl(totais.verbaCury)}</TableCell><TableCell className="text-right font-mono text-white">{brl(totais.investimentosPessoais)}</TableCell><TableCell className="text-right font-mono text-white">{brl(totais.acelera)}</TableCell><TableCell className="text-right font-mono text-[#39FF14]">{brl(totalInvestimentoGeral)}</TableCell><TableCell className="text-right font-mono text-white">{(totalInvestimentoGeral > 0 ? totais.metaSup / totalInvestimentoGeral : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</TableCell><TableCell /></TableRow>}
                </TableBody>
              </Table>
            </div>
            <p className="text-right text-[8px] uppercase tracking-[0.14em] text-white/30">Custo por venda planejado = Meta SUP / Investimento total</p>
          </section>
        );
      })()}

      {tipo === "planejamento" && (() => {
        const principal = lancsView.filter((l) => (l.secao || "principal") === "principal");
        const verba = lancsView.filter((l) => l.secao === "verba");
        const acelera = lancsView.filter((l) => l.secao === "acelera");
        const totMetaGer = principal.reduce((s, l) => s + Number(l.meta_gerente || 0), 0);
        const totMetaSup = principal.reduce((s, l) => s + Number(l.meta_sup || 0), 0);
        const totVerbaCury = verba.reduce((s, l) => s + Number(l.verba_cury || 0), 0);
        const totVerbaGer = verba.reduce((s, l) => s + Number(l.verba_gerente || 0), 0);
        const totVerbaSup = verba.reduce((s, l) => s + Number(l.verba_superintendente || 0), 0);
        const gerentes = new Set(principal.map((l) => l.gerente).filter(Boolean)).size;
        const distinctPlantoes = new Set(principal.map((l) => l.plantao).filter(Boolean)).size;
        const totalPlantoes = PLANTOES.length;
        const totAceleraCor = acelera.reduce((s, l) => s + Number(l.verba_cury || 0), 0);
        const totAceleraGer = acelera.reduce((s, l) => s + Number(l.verba_gerente || 0), 0);
        const totAceleraSup = acelera.reduce((s, l) => s + Number(l.verba_superintendente || 0), 0);
        const totAceleraDir = acelera.reduce((s, l) => s + Number(l.meta_gerente || 0), 0);
        const totAceleraInv = totAceleraCor + totAceleraGer + totAceleraSup + totAceleraDir;
        const qtdCorretores = new Set(acelera.map((l) => l.nome_recebedor).filter(Boolean)).size;
        const qtdGerentesAce = new Set(acelera.map((l) => l.gerente).filter(Boolean)).size;
        const qtdSupAce = new Set(acelera.map((l) => l.superintendente).filter(Boolean)).size;
        return (
          <div className="order-1 space-y-6">
            {/* -- Metas -- */}
            <Card className="rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold text-[#39FF14] uppercase tracking-[0.25em]">// RESUMO METAS</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Meta Gerente
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{totMetaGer.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Meta Sup.
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{totMetaSup.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Gerentes
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{gerentes}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Plantões
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{distinctPlantoes} <span className="text-base font-normal text-gray-400">de {totalPlantoes}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* -- Verbas -- */}
            <Card className="rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold text-[#39FF14] uppercase tracking-[0.25em]">// RESUMO VERBAS</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Verba Cury
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totVerbaCury)}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Verba Gerente
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totVerbaGer)}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Verba Sup.
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totVerbaSup)}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Verba
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totVerbaCury + totVerbaGer + totVerbaSup)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* -- Acelera Vendas -- */}
            <Card className="rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold text-[#39FF14] uppercase tracking-[0.25em]">// RESUMO ACELERA VENDAS</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Corretores
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totAceleraCor)}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Gerente
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totAceleraGer)}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Sup.
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totAceleraSup)}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Diretor
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totAceleraDir)}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">
                      Total Investido
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{brl(totAceleraInv)}</div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">Corretores participantes</div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{qtdCorretores}</div>
                  </div>
                  <div className="rounded-none border border-[#39FF14]/40 bg-black/60 backdrop-blur-md p-4">
                    <div className="text-[10px] font-medium text-[#39FF14] uppercase tracking-widest">Gerentes (participantes)</div>
                    <div className="mt-1 text-2xl font-bold text-gray-300">{qtdGerentesAce}</div>
                  </div>
                </div>
              </CardContent>
            {(() => {
                const groups = new Map<string, { inv: number; cor: number; ger: number; sup: number; dir: number; count: number }>();
                acelera.forEach((l) => {
                  const k = l.gerente || "—";
                  const g = groups.get(k) || { inv: 0, cor: 0, ger: 0, sup: 0, dir: 0, count: 0 };
                  g.cor += Number(l.verba_cury || 0);
                  g.ger += Number(l.verba_gerente || 0);
                  g.sup += Number(l.verba_superintendente || 0);
                  g.dir += Number(l.meta_gerente || 0);
                  g.inv += Number(l.verba_cury || 0) + Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0) + Number(l.meta_gerente || 0);
                  g.count += 1;
                  groups.set(k, g);
                });
                if (groups.size === 0) return null;
                return (
                  <Card className="mt-3 rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Gerente</TableHead>
                            <TableHead className="text-right">Corretores</TableHead>
                            <TableHead className="text-right">Investido</TableHead>
                            <TableHead className="text-right">Corretor</TableHead>
                            <TableHead className="text-right">Gerente</TableHead>
                            <TableHead className="text-right">Sup.</TableHead>
                            <TableHead className="text-right">Diretor</TableHead>
                            <TableHead className="w-24"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(groups.entries()).map(([g, v]) => (
                            <TableRow key={g}>
                              <TableCell className="font-medium">{g}</TableCell>
                              <TableCell className="text-right">{v.count}</TableCell>
                              <TableCell className="text-right font-semibold">{brl(v.inv)}</TableCell>
                              <TableCell className="text-right">{brl(v.cor)}</TableCell>
                              <TableCell className="text-right">{brl(v.ger)}</TableCell>
                              <TableCell className="text-right">{brl(v.sup)}</TableCell>
                              <TableCell className="text-right">{brl(v.dir)}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="outline" size="sm" disabled={!canEditWrite} onClick={() => openEditAceleraGerente(g)}>
                                  <Pencil className="mr-1 h-3 w-3" /> Editar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })()}
            </Card>
          </div>
        );
      })()}
      </div>

      <div className="flex items-center justify-between">
        {tipo !== "contratacao" && tipo !== "planejamento" && <h2 className={tipo === "gastos_pessoais" ? "text-[10px] font-bold text-[#39FF14] uppercase tracking-[0.25em]" : "text-lg font-semibold"}>LANÇAMENTOS</h2>}
        <div className="flex flex-wrap gap-2">
          {isVerba && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={baixarLancamentosExcel}
                disabled={lancs.length === 0}
                title="Baixar planilha XLSX com todos os lançamentos"
              >
                <Download className="mr-1 h-4 w-4" /> Baixar lançamentos
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={baixarTodosAnexos}
                disabled={downloadingAll || lancs.length === 0}
                title="Baixar PDF unificado com comprovantes e boletos"
              >
                <FileText className="mr-1 h-4 w-4" /> {downloadingAll ? "Gerando..." : "Baixar comprovantes"}
              </Button>
            </>
          )}
          {tipo === "leads" && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) importarLeadsXlsx(f);
                }}
              />
              <Button variant="outline" onClick={baixarModeloLeads} type="button">
                <Download className="mr-1 h-4 w-4" /> Baixar modelo
              </Button>
              <Button
                variant="secondary"
                onClick={() => importInputRef.current?.click()}
                disabled={!canEditWrite || importBusy}
                type="button"
              >
                <Paperclip className="mr-1 h-4 w-4" /> {importBusy ? "Importando..." : "Importar planilha"}
              </Button>
            </>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className={`max-h-[90vh] border-[#1e3a5f] dialog-border-blue ${isCyber ? "verba-cyber text-white" : ""} ${(tipo === "planejamento" || tipo === "acelera_vendas") ? "max-w-2xl" : ""} overflow-y-auto bg-black/60 backdrop-blur-xl`}>
            <div className="max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle className={isCyber ? "text-[#39FF14] uppercase tracking-[0.25em]" : ""}>
                {editingGerente
                  ? `Editar gerente: ${editingGerente}`
                  : editingAceleraGerente
                    ? `Editar Acelera: ${editingAceleraGerente}`
                    : isCyber
                      ? "// NOVO LANÇAMENTO"
                      : "Novo Lançamento"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={addLancamento} className="space-y-4">
              {tipo === "verba_cury" && (
                <>
                  <div><Label className="text-gray-400 uppercase tracking-widest text-[10px]">Quem recebeu</Label>
                    <Select value={nome} onValueChange={setNome}>
                      <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"><SelectValue placeholder="SELECIONE..." /></SelectTrigger>
                      <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                        {Array.from(
                          new Set([
                            ...usuarios.map((u) => u.nome),
                            ...gerentes
                              .filter((g) => gerenteDisponivelEm(g, form?.mes_referencia ?? null, form?.ano_referencia ?? null))
                              .map((g) => g.nome),
                          ].filter(Boolean)),
                        )
                          .sort((a, b) => a.localeCompare(b))
                          .map((n) => (
                            <SelectItem key={n} value={n} className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10">{n.toUpperCase()}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Valor</Label>
                    <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                  </div>
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Descrição</Label>
                    <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                  </div>
                </>
              )}
              {tipo === "gastos_pessoais" && (
                <>
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Quem pagou</Label>
                    <Select value={quemPagou} onValueChange={(v) => { setQuemPagou(v); setRecebedorModo("self"); setGerentesSelecionados([]); setNome(v); }}>
                      <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"><SelectValue placeholder="SELECIONE..." /></SelectTrigger>
                      <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                        <PessoaSelectContentItems opts={peopleOpts} cyber />
                      </SelectContent>
                    </Select>
                  </div>
                  {(() => {
                    const pagouEhSup = !!quemPagou && peopleOpts.sups.includes(quemPagou);
                    const gerentesDaSup = pagouEhSup
                      ? (isAdmin
                          ? allGerentesComSup.filter((g) => g.sup === quemPagou && gerenteDisponivelEm(g, form?.mes_referencia ?? null, form?.ano_referencia ?? null)).map((g) => g.nome)
                          : peopleOpts.gers)
                      : [];
                    if (pagouEhSup) {
                      return (
                        <>
                          <div className="space-y-2">
                            <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Quem recebeu</Label>
                            <div className="flex gap-2">
                              <Button type="button" variant={recebedorModo === "self" ? "default" : "outline"} size="sm" onClick={() => { setRecebedorModo("self"); setNome(quemPagou); setGerentesSelecionados([]); }} className={recebedorModo === "self" ? "rounded-none bg-[#39FF14] text-black hover:bg-[#39FF14]/90 font-bold uppercase tracking-widest text-[10px]" : "rounded-none bg-transparent border border-[#39FF14]/30 text-gray-300 hover:border-[#39FF14] hover:text-[#39FF14] uppercase tracking-widest text-[10px]"}>Eu mesmo</Button>
                              <Button type="button" variant={recebedorModo === "gerentes" ? "default" : "outline"} size="sm" onClick={() => { setRecebedorModo("gerentes"); setNome(""); }} className={recebedorModo === "gerentes" ? "rounded-none bg-[#39FF14] text-black hover:bg-[#39FF14]/90 font-bold uppercase tracking-widest text-[10px]" : "rounded-none bg-transparent border border-[#39FF14]/30 text-gray-300 hover:border-[#39FF14] hover:text-[#39FF14] uppercase tracking-widest text-[10px]"}>Responsável</Button>
                            </div>
                          </div>
                          {recebedorModo === "gerentes" && (
                            <div className="rounded-none border border-[#1e3a5f] bg-black/60 p-3 space-y-2 max-h-60 overflow-y-auto">
                              <div className="flex items-center justify-between">
                                <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Selecione os responsáveis</Label>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setGerentesSelecionados(gerentesSelecionados.length === gerentesDaSup.length ? [] : [...gerentesDaSup])} className="rounded-none text-[#39FF14] hover:bg-[#39FF14]/10 uppercase tracking-widest text-[10px]">
                                  {gerentesSelecionados.length === gerentesDaSup.length ? "Limpar" : "Selecionar todos"}
                                </Button>
                              </div>
                              {gerentesDaSup.length === 0 && <div className="text-xs text-gray-500 uppercase tracking-widest text-[10px]">Nenhum responsável disponível</div>}
                              {gerentesDaSup.map((g) => {
                                const checked = gerentesSelecionados.includes(g);
                                return (
                                  <label key={g} className="flex items-center gap-2 cursor-pointer">
                                    <Checkbox checked={checked} onCheckedChange={(c) => {
                                      setGerentesSelecionados((prev) => c ? [...prev, g] : prev.filter((x) => x !== g));
                                    }} className="rounded-none border-[#39FF14]/30 data-[state=checked]:bg-[#39FF14] data-[state=checked]:text-black" />
                                    <span className="text-sm text-gray-300">{g}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </>
                      );
                    }
                    return (
                      <div>
                        <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Quem recebeu</Label>
                        <Select value={nome} onValueChange={setNome}>
                          <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"><SelectValue placeholder="SELECIONE..." /></SelectTrigger>
                          <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                            <PessoaSelectContentItems opts={peopleOpts} cyber />
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Valor</Label>
                    <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                    {recebedorModo === "gerentes" && gerentesSelecionados.length > 0 && Number(valor) > 0 && (
                      <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest text-[10px]">Será dividido em {gerentesSelecionados.length} lançamento(s) de {brl(Number(valor) / gerentesSelecionados.length)} cada.</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Tipo de gasto</Label>
                    <Select value={tipoGasto} onValueChange={setTipoGasto}>
                      <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"><SelectValue placeholder="SELECIONE..." /></SelectTrigger>
                      <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                        {TIPOS_GASTO.map((t) => <SelectItem key={t} value={t} className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {tipoGasto && (
                    <div className="text-xs uppercase tracking-widest text-[10px]">
                      Destinação: <span className={`inline-flex items-center rounded-none border px-2 py-0.5 text-[10px] uppercase tracking-widest ${destinacaoFromTipoGasto(tipoGasto) === "Gerar Venda" ? "border-[#39FF14]/40 bg-[#39FF14]/10 text-[#39FF14]" : "border-sky-400/40 bg-sky-500/10 text-sky-400"}`}>{destinacaoFromTipoGasto(tipoGasto)}</span>
                    </div>
                  )}
                  <div><Label className="text-gray-400 uppercase tracking-widest text-[10px]">Descrição</Label><Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" /></div>
                </>
              )}
              {tipo === "contratacao" && (
                <>
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Gerente</Label>
                    <Select value={gerente} onValueChange={setGerente}>
                      <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"><SelectValue placeholder="SELECIONE..." /></SelectTrigger>
                      <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                        <PessoaSelectContentItems opts={peopleOpts} cyber />
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Candidatos</Label>
                      <Input type="number" value={candidatos} onChange={(e) => setCandidatos(e.target.value)} required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                    </div>
                    <div>
                      <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Contratados</Label>
                      <Input type="number" value={contratados} onChange={(e) => setContratados(e.target.value)} required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Fonte</Label>
                    <Input value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="EX: INDICAÇÃO, SITE, INSTAGRAM..." required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0 uppercase tracking-widest text-[10px]" />
                  </div>
                  <div>
                    <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Semana (Seg → Dom)</Label>
                    <Select value={contratacaoSemana} onValueChange={setContratacaoSemana}>
                      <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"><SelectValue placeholder="SELECIONE A SEMANA..." /></SelectTrigger>
                      <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                        {semanasDoMes(Number(form.mes_referencia ?? new Date().getMonth() + 1), Number(form.ano_referencia ?? new Date().getFullYear())).map((s: SemanaOpt) => (
                          <SelectItem key={s.inicio} value={s.inicio} className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10">{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {tipo === "meta" && (
                <>
                  <div><Label>Gerente</Label>
                    <Select value={gerente} onValueChange={setGerente}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent><PessoaSelectContentItems opts={peopleOpts} /></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Arquivo</Label>
                    <Input type="file" accept="image/*,application/pdf" onChange={(e) => setArquivoMeta(e.target.files?.[0] || null)} />
                  </div>
                </>
              )}
              {tipo === "leads" && (
                <>
                  <div><Label>Superintendente</Label><Input value={leadsSuper} onChange={(e) => setLeadsSuper(e.target.value)} required /></div>
                  <div><Label>Gerente</Label>
                    <Select value={gerente} onValueChange={setGerente}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent><PessoaSelectContentItems opts={peopleOpts} /></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Produto</Label><Input value={leadsProduto} onChange={(e) => setLeadsProduto(e.target.value)} required /></div>
                  <div><Label>Número de leads</Label><Input type="number" min="0" value={leadsQtd} onChange={(e) => setLeadsQtd(e.target.value)} required /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Mês</Label>
                      <Select value={leadsMes} onValueChange={(v) => { setLeadsMes(v); setLeadsSemana(""); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Ano</Label>
                      <Input type="number" value={leadsAno} onChange={(e) => { setLeadsAno(e.target.value); setLeadsSemana(""); }} required />
                    </div>
                  </div>
                  <div>
                    <Label>Semana (Seg → Dom)</Label>
                    <Select value={leadsSemana} onValueChange={setLeadsSemana}>
                      <SelectTrigger><SelectValue placeholder="Selecione a semana..." /></SelectTrigger>
                      <SelectContent>
                        {semanasDoMes(Number(leadsMes), Number(leadsAno)).map((s: SemanaOpt) => (
                          <SelectItem key={s.inicio} value={s.inicio}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {(tipo === "planejamento" || tipo === "acelera_vendas") && (
                <>
                  <div>
                    <Label>Seção</Label>
                    <Select value={planSecao} onValueChange={(v) => setPlanSecao(v as "principal" | "verba" | "acelera")} disabled={tipo === "acelera_vendas"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tipo === "planejamento" && <SelectItem value="principal">Principal (Metas)</SelectItem>}
                        {tipo === "planejamento" && <SelectItem value="verba">Verba</SelectItem>}
                        <SelectItem value="acelera">Acelera Vendas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Gerente</Label>
                    <Select value={gerente} onValueChange={setGerente}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent><PessoaSelectContentItems opts={peopleOpts} /></SelectContent>
                    </Select>
                  </div>
                  {planSecao === "principal" && (
                    <>
                      {(() => {
                        const totGer = plantoesList.reduce((s, p) => s + (Number(planMetas[p]?.ger) || 0), 0);
                        const totSup = plantoesList.reduce((s, p) => s + (Number(planMetas[p]?.sup) || 0), 0);
                        return (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-md border bg-muted/40 p-3">
                              <div className="text-xs text-muted-foreground">Total Meta Gerente</div>
                              <div className="text-xl font-semibold text-emerald-600">{totGer.toLocaleString("pt-BR")}</div>
                            </div>
                            <div className="rounded-md border bg-muted/40 p-3">
                              <div className="text-xs text-muted-foreground">Total Meta Sup.</div>
                              <div className="text-xl font-semibold text-emerald-600">{totSup.toLocaleString("pt-BR")}</div>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Plantão</TableHead>
                              <TableHead className="w-[140px]">Meta Gerente</TableHead>
                              <TableHead className="w-[140px]">Meta Sup.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {plantoesList.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                                  Sem plantões disponíveis
                                </TableCell>
                              </TableRow>
                            ) : (
                              plantoesList.map((p) => (
                                <TableRow key={p}>
                                  <TableCell className="font-medium">{p}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number" step="1" min="0"
                                      value={planMetas[p]?.ger ?? ""}
                                      onChange={(e) => setPlanMetas((m) => ({ ...m, [p]: { ger: e.target.value, sup: m[p]?.sup ?? "" } }))}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number" step="1" min="0"
                                      value={planMetas[p]?.sup ?? ""}
                                      onChange={(e) => setPlanMetas((m) => ({ ...m, [p]: { ger: m[p]?.ger ?? "", sup: e.target.value } }))}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-muted-foreground">Preencha somente os plantões que deseja lançar. Cada plantão preenchido vira um lançamento.</p>
                    </>
                  )}
                  {planSecao === "verba" && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div><Label>Verba Cury</Label><Input type="number" step="0.01" value={planVerbaCury} onChange={(e) => setPlanVerbaCury(e.target.value)} required /></div>
                        <div><Label>Verba Gerente</Label><Input type="number" step="0.01" value={planVerbaGer} onChange={(e) => setPlanVerbaGer(e.target.value)} required /></div>
                        <div><Label>Verba Sup.</Label><Input type="number" step="0.01" value={planVerbaSup} onChange={(e) => setPlanVerbaSup(e.target.value)} required /></div>
                      </div>
                    </>
                  )}
                  {planSecao === "acelera" && (
                    <>
                      {(() => {
                        const totals = aceleraRows.reduce(
                          (acc, r) => {
                            const sp = aceleraSplit(Number(r.valor));
                            acc.inv += Number(r.valor) || 0;
                            acc.cor += sp.corretor;
                            acc.ger += sp.gerente;
                            acc.sup += sp.sup;
                            acc.dir += sp.diretor;
                            return acc;
                          },
                          { inv: 0, cor: 0, ger: 0, sup: 0, dir: 0 },
                        );
                        return (
                          <div className="grid grid-cols-5 gap-2">
                            <div className="rounded-md border bg-muted/40 p-2"><div className="text-[10px] text-muted-foreground">Investido</div><div className="text-sm font-semibold">{brl(totals.inv)}</div></div>
                            <div className="rounded-md border bg-muted/40 p-2"><div className="text-[10px] text-muted-foreground">Corretor</div><div className="text-sm font-semibold">{brl(totals.cor)}</div></div>
                            <div className="rounded-md border bg-muted/40 p-2"><div className="text-[10px] text-muted-foreground">Gerente</div><div className="text-sm font-semibold">{brl(totals.ger)}</div></div>
                            <div className="rounded-md border bg-muted/40 p-2"><div className="text-[10px] text-muted-foreground">Sup.</div><div className="text-sm font-semibold">{brl(totals.sup)}</div></div>
                            <div className="rounded-md border bg-muted/40 p-2"><div className="text-[10px] text-muted-foreground">Diretor</div><div className="text-sm font-semibold">{brl(totals.dir)}</div></div>
                          </div>
                        );
                      })()}
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Corretor</TableHead>
                              <TableHead className="w-[160px]">Valor investido</TableHead>
                              <TableHead className="w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {aceleraRows.map((r, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <Input
                                    value={r.corretor}
                                    onChange={(e) => setAceleraRows((rows) => rows.map((x, i) => (i === idx ? { ...x, corretor: e.target.value } : x)))}
                                    placeholder="Nome do corretor"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={r.valor}
                                    onValueChange={(v) => setAceleraRows((rows) => rows.map((x, i) => (i === idx ? { ...x, valor: v as AceleraPacote } : x)))}
                                  >
                                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="2550">R$ 2.550</SelectItem>
                                      <SelectItem value="5100">R$ 5.100</SelectItem>
                                      <SelectItem value="8500">R$ 8.500</SelectItem>
                                      <SelectItem value="13600">R$ 13.600</SelectItem>
                                      <SelectItem value="17000">R$ 17.000</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive"
                                    onClick={() => setAceleraRows((rows) => rows.length === 1 ? [{ corretor: "", valor: "" }] : rows.filter((_, i) => i !== idx))}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAceleraRows((rows) => [...rows, { corretor: "", valor: "" }])}>
                        <Plus className="mr-1 h-3 w-3" /> Adicionar corretor
                      </Button>
                    </>
                  )}
                </>
              )}
              {tipo === "verba_cury" && (
                <div>
                  <Label className="text-gray-400 uppercase tracking-widest text-[10px]">Data e hora</Label>
                  <Input type="datetime-local" step="1" value={dataHora} onChange={(e) => setDataHora(e.target.value)} required className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 focus-visible:border-[#39FF14] focus-visible:ring-0" />
                </div>
              )}
              <Button type="submit" disabled={busy} className={isCyber ? "w-full rounded-none bg-black border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14] hover:text-black font-bold uppercase tracking-widest text-xs" : "w-full"}>{busy ? "SALVANDO..." : "SALVAR"}</Button>
            </form>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>


      {isVerba && <Card className="border border-[#1e3a5f] bg-white/5 backdrop-blur-md rounded-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebedor</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Anexos</TableHead>
                {isAdmin && <TableHead className="text-center">Validação</TableHead>}
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancsView.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-muted-foreground">Nenhum lançamento ainda</TableCell></TableRow>
              ) : (
                lancsView.map((l) => {
                  const hasAny = !!(l.comprovante_url || l.boleto_url);
                  return (
                    <TableRow key={l.id} className={l.reprovado ? "bg-destructive/10" : ""}>
                      <TableCell className="font-medium">{l.nome_recebedor}</TableCell>
                      <TableCell>{brl(Number(l.valor))}</TableCell>
                      <TableCell className="text-muted-foreground">{l.descricao}</TableCell>
                      <TableCell>{fmtDate(l.data_hora)}</TableCell>
                      <TableCell>{fmtTime(l.data_hora)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            variant={l.comprovante_url ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => triggerUpload(l.id, "comprovante")}
                            disabled={!canEditWrite || uploadingId === l.id}
                            title="Anexar comprovante"
                          >
                            <Paperclip className="h-3 w-3" /> Comprovante {l.comprovante_url && "✓"}
                          </Button>
                          {l.comprovante_url && canEditWrite && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAnexo(l.id, "comprovante")} title="Remover comprovante"><X className="h-3 w-3" /></Button>
                          )}
                          <Button
                            variant={l.boleto_url ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => triggerUpload(l.id, "boleto")}
                            disabled={!canEditWrite || uploadingId === l.id}
                            title="Anexar boleto/recibo"
                          >
                            <FileText className="h-3 w-3" /> Boleto/Recibo {l.boleto_url && "✓"}
                          </Button>
                          {l.boleto_url && canEditWrite && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAnexo(l.id, "boleto")} title="Remover boleto"><X className="h-3 w-3" /></Button>
                          )}
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => visualizarUnificado(l)}
                            disabled={!hasAny || generatingId === l.id}
                            title="Visualizar PDF unificado"
                          >
                            <Eye className="h-3 w-3" /> {generatingId === l.id ? "Gerando..." : "Ver PDF"}
                          </Button>
                        </div>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant={!l.reprovado ? "default" : "outline"}
                              size="icon"
                              className={!l.reprovado ? "h-8 w-8 bg-emerald-600 hover:bg-emerald-700" : "h-8 w-8 text-emerald-600 border-emerald-600 hover:bg-emerald-50"}
                              onClick={() => marcarLancamento(l.id, false)}
                              disabled={!canValidateLancamentos}
                              title={canValidateLancamentos ? "Marcar como correto" : "Verba já validada/reprovada"}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={l.reprovado ? "destructive" : "outline"}
                              size="icon"
                              className={l.reprovado ? "h-8 w-8" : "h-8 w-8 text-destructive border-destructive hover:bg-destructive/10"}
                              onClick={() => reprovarComMotivo(l.id)}
                              disabled={!canValidateLancamentos}
                              title={canValidateLancamentos ? "Marcar como incorreto" : "Verba já validada/reprovada"}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          {l.reprovado && l.motivo_reprovacao && (
                            <div className="mt-1 text-xs text-destructive max-w-[200px] truncate" title={l.motivo_reprovacao}>{l.motivo_reprovacao}</div>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={!canEditWrite}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className={isCyber ? "verba-cyber" : ""}>
                            <AlertDialogHeader>
                              <AlertDialogTitle className={isCyber ? "text-[#39FF14] uppercase tracking-[0.25em] text-sm" : ""}>
                                {isCyber ? "// EXCLUIR LANÇAMENTO" : "Excluir lançamento?"}
                              </AlertDialogTitle>
                              <AlertDialogDescription className={isCyber ? "text-gray-400 normal-case tracking-normal" : ""}>
                                {isCyber
                                  ? `Esta ação não pode ser desfeita. O lançamento de ${l.nome_recebedor} (${brl(Number(l.valor))}) será removido permanentemente.`
                                  : "Esta ação não pode ser desfeita."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className={isCyber ? "rounded-none bg-black border border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white uppercase tracking-widest text-[11px]" : ""}>
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteLancamento(l.id)}
                                className={isCyber ? "rounded-none bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-black font-bold uppercase tracking-widest text-xs" : ""}
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>}

      {false && tipo === "planejamento" && (() => {
        const principal = lancsView.filter((l) => (l.secao || "principal") === "principal");
        const groups = new Map<string, { ger: number; sup: number; count: number }>();
        principal.forEach((l) => {
          const k = l.gerente || "—";
          const g = groups.get(k) || { ger: 0, sup: 0, count: 0 };
          g.ger += Number(l.meta_gerente || 0);
          g.sup += Number(l.meta_sup || 0);
          g.count += 1;
          groups.set(k, g);
        });
        if (groups.size === 0) return null;
        return (
          <Card className="rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gerente</TableHead>
                    <TableHead className="text-right">Plantões</TableHead>
                    <TableHead className="text-right">Total Meta Ger.</TableHead>
                    <TableHead className="text-right">Total Meta Sup.</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(groups.entries()).map(([g, v]) => (
                    <TableRow key={g}>
                      <TableCell className="font-medium">{g}</TableCell>
                      <TableCell className="text-right">{v.count}</TableCell>
                      <TableCell className="text-right text-white font-semibold">{v.ger.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-white font-semibold">{v.sup.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" disabled={!canEditWrite} onClick={() => openEditPlanGerente(g)}>
                          <Pencil className="mr-1 h-3 w-3" /> Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {false && tipo === "planejamento" && (() => {
        const principal = lancsView.filter((l) => (l.secao || "principal") === "principal");
        const verba = lancsView.filter((l) => l.secao === "verba");
        const acelera = lancsView.filter((l) => l.secao === "acelera");
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#39FF14] uppercase tracking-[0.25em]">LANÇAMENTOS — METAS</h3>
              <Card className="rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[#39FF14]">Gerente</TableHead>
                        <TableHead className="text-[#39FF14]">Plantão</TableHead>
                        <TableHead className="text-right text-[#39FF14]">Meta Ger.</TableHead>
                        <TableHead className="text-right text-[#39FF14]">Meta Sup.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {principal.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhuma meta lançada</TableCell></TableRow>
                      ) : (
                        <>
                          {principal.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="font-medium text-white">{l.gerente || "—"}</TableCell>
                              <TableCell className="text-white">{l.plantao || "—"}</TableCell>
                              <TableCell className="text-right text-white">{l.meta_gerente != null ? Number(l.meta_gerente).toLocaleString("pt-BR") : "—"}</TableCell>
                              <TableCell className="text-right text-white">{l.meta_sup != null ? Number(l.meta_sup).toLocaleString("pt-BR") : "—"}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 font-bold bg-muted/30">
                            <TableCell colSpan={2} className="font-semibold text-white">Total</TableCell>
                            <TableCell className="text-right text-white">{principal.reduce((s, l) => s + Number(l.meta_gerente || 0), 0).toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right text-white">{principal.reduce((s, l) => s + Number(l.meta_sup || 0), 0).toLocaleString("pt-BR")}</TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <p className="text-[10px] text-[#39FF14] uppercase tracking-widest text-right">{principal.length} LANÇAMENTO{principal.length !== 1 ? 'S' : ''}</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#39FF14] uppercase tracking-[0.25em]">LANÇAMENTOS — VERBAS</h3>
              <Card className="rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[#39FF14]">Gerente</TableHead>
                        <TableHead className="text-[#39FF14]">Plantão</TableHead>
                        <TableHead className="text-right text-[#39FF14]">V. Cury</TableHead>
                        <TableHead className="text-right text-[#39FF14]">V. Ger.</TableHead>
                        <TableHead className="text-right text-[#39FF14]">V. Sup.</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {verba.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma verba lançada</TableCell></TableRow>
                      ) : (
                        <>
                          {verba.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="font-medium text-white">{l.gerente || "—"}</TableCell>
                              <TableCell className="text-white">{l.plantao || "—"}</TableCell>
                              <TableCell className="text-right text-white">{l.verba_cury != null ? brl(Number(l.verba_cury)) : "—"}</TableCell>
                              <TableCell className="text-right text-white">{l.verba_gerente != null ? brl(Number(l.verba_gerente)) : "—"}</TableCell>
                              <TableCell className="text-right text-white">{l.verba_superintendente != null ? brl(Number(l.verba_superintendente)) : "—"}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" disabled={!canEditWrite} onClick={() => openEditPlanVerba(l)} title="Editar">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 font-bold bg-muted/30">
                            <TableCell colSpan={2} className="font-semibold text-white">Total</TableCell>
                            <TableCell className="text-right text-white">{brl(verba.reduce((s, l) => s + Number(l.verba_cury || 0), 0))}</TableCell>
                            <TableCell className="text-right text-white">{brl(verba.reduce((s, l) => s + Number(l.verba_gerente || 0), 0))}</TableCell>
                            <TableCell className="text-right text-white">{brl(verba.reduce((s, l) => s + Number(l.verba_superintendente || 0), 0))}</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <p className="text-[10px] text-[#39FF14] uppercase tracking-widest text-right">{verba.length} LANÇAMENTO{verba.length !== 1 ? 'S' : ''}</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#39FF14] uppercase tracking-[0.25em]">LANÇAMENTOS — ACELERA VENDAS</h3>
              <Card className="rounded-none border border-[#1e3a5f] bg-black/40 backdrop-blur-md">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[#39FF14]">Gerente</TableHead>
                        <TableHead className="text-[#39FF14]">Corretor</TableHead>
                        <TableHead className="text-right text-[#39FF14]">Investido</TableHead>
                        <TableHead className="text-right text-[#39FF14]">Corretor</TableHead>
                        <TableHead className="text-right text-[#39FF14]">Gerente</TableHead>
                        <TableHead className="text-right text-[#39FF14]">Sup.</TableHead>
                        <TableHead className="text-right text-[#39FF14]">Diretor</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acelera.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum lançamento</TableCell></TableRow>
                      ) : (
                        <>
                          {acelera.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="font-medium text-white">{l.gerente || "—"}</TableCell>
                              <TableCell className="text-white">{l.nome_recebedor || "—"}</TableCell>
                              <TableCell className="text-right font-semibold text-white">{brl(Number(l.verba_cury || 0) + Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0) + Number(l.meta_gerente || 0))}</TableCell>
                              <TableCell className="text-right text-white">{brl(Number(l.verba_cury || 0))}</TableCell>
                              <TableCell className="text-right text-white">{brl(Number(l.verba_gerente || 0))}</TableCell>
                              <TableCell className="text-right text-white">{brl(Number(l.verba_superintendente || 0))}</TableCell>
                              <TableCell className="text-right text-white">{brl(Number(l.meta_gerente || 0))}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" disabled={!canEditWrite} onClick={() => openEditAceleraGerente(l.gerente || "")} title="Editar">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={!canEditWrite}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className={isCyber ? "verba-cyber" : ""}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className={isCyber ? "text-[#39FF14] uppercase tracking-[0.25em] text-sm" : ""}>
                                        {isCyber ? "// EXCLUIR LANÇAMENTO" : "Excluir lançamento?"}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription className={isCyber ? "text-gray-400 normal-case tracking-normal" : ""}>
                                        {isCyber
                                          ? `Esta ação não pode ser desfeita. O lançamento de ${l.nome_recebedor} (${brl(Number(l.valor))}) será removido permanentemente.`
                                          : "Esta ação não pode ser desfeita."}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className={isCyber ? "rounded-none bg-black border border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white uppercase tracking-widest text-[11px]" : ""}>
                                        Cancelar
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteLancamento(l.id)}
                                        className={isCyber ? "rounded-none bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-black font-bold uppercase tracking-widest text-xs" : ""}
                                      >
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 font-bold bg-muted/30">
                            <TableCell colSpan={2} className="font-semibold text-white">Total</TableCell>
                            <TableCell className="text-right font-semibold text-white">{brl(acelera.reduce((s, l) => s + Number(l.verba_cury || 0) + Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0) + Number(l.meta_gerente || 0), 0))}</TableCell>
                            <TableCell className="text-right text-white">{brl(acelera.reduce((s, l) => s + Number(l.verba_cury || 0), 0))}</TableCell>
                            <TableCell className="text-right text-white">{brl(acelera.reduce((s, l) => s + Number(l.verba_gerente || 0), 0))}</TableCell>
                            <TableCell className="text-right text-white">{brl(acelera.reduce((s, l) => s + Number(l.verba_superintendente || 0), 0))}</TableCell>
                            <TableCell className="text-right text-white">{brl(acelera.reduce((s, l) => s + Number(l.meta_gerente || 0), 0))}</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <p className="text-[10px] text-[#39FF14] uppercase tracking-widest text-right">{acelera.length} LANÇAMENTO{acelera.length !== 1 ? 'S' : ''}</p>
            </div>
          </div>
        );
      })()}

      {tipo === "acelera_vendas" && (() => {
        const acelera = lancsView.filter((l) => l.secao === "acelera");
        const totCor = acelera.reduce((s, l) => s + Number(l.verba_cury || 0), 0);
        const totGer = acelera.reduce((s, l) => s + Number(l.verba_gerente || 0), 0);
        const totSup = acelera.reduce((s, l) => s + Number(l.verba_superintendente || 0), 0);
        const totDir = acelera.reduce((s, l) => s + Number(l.meta_gerente || 0), 0);
        const totInv = totCor + totGer + totSup + totDir;
        return (
          <div className="space-y-4">
            {planejamentoValidado && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Planejamento validado — não é possível incluir novos participantes.
              </div>
            )}
            {!isValidated && (
              <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
                Aguardando validação do admin — comprovantes e boletos só podem ser anexados após a validação do formulário.
              </div>
            )}
            {isValidated && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                Formulário validado — anexe os comprovantes e boletos. Não é mais possível incluir novos lançamentos.
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-5">
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total Investido</div><div className="text-2xl font-semibold">{brl(totInv)}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Corretores</div><div className="text-2xl font-semibold text-emerald-600">{brl(totCor)}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Gerente</div><div className="text-2xl font-semibold text-emerald-600">{brl(totGer)}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Sup.</div><div className="text-2xl font-semibold text-emerald-600">{brl(totSup)}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Diretores</div><div className="text-2xl font-semibold text-emerald-600">{brl(totDir)}</div></CardContent></Card>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gerente</TableHead>
                      <TableHead>Corretor</TableHead>
                      <TableHead className="text-right">Investido</TableHead>
                      <TableHead>Comp. Corretor</TableHead>
                      <TableHead>Comp. Gerente</TableHead>
                      <TableHead>Comp. Sup.</TableHead>
                      <TableHead>Boleto Diretor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acelera.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum participante. Crie/valide o Planejamento Acelera Vendas correspondente.</TableCell></TableRow>
                    ) : acelera.map((l) => {
                      const inv = Number(l.verba_cury || 0) + Number(l.verba_gerente || 0) + Number(l.verba_superintendente || 0) + Number(l.meta_gerente || 0);
                      const steps: Array<{ key: AnexoTipo; url: string | null; label: string; req: string | null }> = [
                        { key: "comp_corretor", url: l.comp_corretor_url, label: "Comprovante", req: null },
                        { key: "comp_gerente", url: l.comp_gerente_url, label: "Comprovante", req: l.comp_corretor_url },
                        { key: "comp_sup", url: l.comp_sup_url, label: "Comprovante", req: l.comp_gerente_url },
                        { key: "boleto_diretor", url: l.boleto_diretor_url, label: "Boleto", req: l.comp_sup_url },
                      ];
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.gerente || "—"}</TableCell>
                          <TableCell>{l.nome_recebedor || "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{brl(inv)}</TableCell>
                          {steps.map((st) => {
                            const blocked = !st.url && st.req == null ? false : !st.url && !st.req;
                            return (
                              <TableCell key={st.key}>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant={st.url ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => triggerUpload(l.id, st.key)}
                                    disabled={!canUploadAcelera || uploadingId === l.id || blocked}
                                    title={!canUploadAcelera ? "Disponível somente após validação do admin" : blocked ? "Anexe o nível anterior primeiro" : st.label}
                                  >
                                    {st.key === "boleto_diretor" ? <FileText className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />} {st.label} {st.url && "✓"}
                                  </Button>
                                  {st.url && canUploadAcelera && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAnexo(l.id, st.key)}><X className="h-3 w-3" /></Button>
                                  )}
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {(!isCyber || tipo === "gastos_pessoais") && tipo !== "planejamento" && tipo !== "acelera_vendas" && (
        <>
        {tipo === "gastos_pessoais" && (() => {
          const groups = new Map<string, { total: number; count: number; gv: number; mn: number }>();
          lancsView.forEach((l) => {
            const k = l.quem_pagou || l.gerente || "—";
            const g = groups.get(k) || { total: 0, count: 0, gv: 0, mn: 0 };
            const v = Number(l.valor || 0);
            g.total += v;
            g.count += 1;
            const dest = l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto);
            if (dest === "Gerar Venda") g.gv += v; else g.mn += v;
            groups.set(k, g);
          });
          if (groups.size === 0) return null;
          return (
            <Card className={tipo === "gastos_pessoais" ? "border border-[#1e3a5f] bg-white/5 backdrop-blur-md rounded-none" : ""}>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className={tipo === "gastos_pessoais" ? "border-b border-[#1e3a5f] hover:bg-transparent" : ""}>
                      <TableHead className={tipo === "gastos_pessoais" ? "text-[#39FF14] uppercase tracking-widest text-[10px]" : ""}>{tipo === "gastos_pessoais" ? "Quem recebeu" : "Gerente"}</TableHead>
                      <TableHead className={`text-right ${tipo === "gastos_pessoais" ? "text-[#39FF14] uppercase tracking-widest text-[10px]" : ""}`}>LANÇAMENTOS</TableHead>
                      <TableHead className={`text-right ${tipo === "gastos_pessoais" ? "text-[#39FF14] uppercase tracking-widest text-[10px]" : ""}`}>Gerar Venda</TableHead>
                      <TableHead className={`text-right ${tipo === "gastos_pessoais" ? "text-[#39FF14] uppercase tracking-widest text-[10px]" : ""}`}>Manutenção</TableHead>
                      <TableHead className={`text-right ${tipo === "gastos_pessoais" ? "text-[#39FF14] uppercase tracking-widest text-[10px]" : ""}`}>Total</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(groups.entries()).map(([g, v]) => (
                      <TableRow key={g} className={tipo === "gastos_pessoais" ? "border-b border-[#1e3a5f]/40 hover:bg-[#39FF14]/5" : ""}>
                        <TableCell className={`font-medium ${tipo === "gastos_pessoais" ? "text-gray-300" : ""}`}>{g}</TableCell>
                        <TableCell className={`text-right ${tipo === "gastos_pessoais" ? "text-gray-300" : ""}`}>{v.count}</TableCell>
                        <TableCell className={`text-right ${tipo === "gastos_pessoais" ? "text-[#39FF14]" : "text-emerald-600"}`}>{brl(v.gv)}</TableCell>
                        <TableCell className={`text-right ${tipo === "gastos_pessoais" ? "text-blue-700" : "text-blue-600"}`}>{brl(v.mn)}</TableCell>
                        <TableCell className={`text-right font-semibold ${tipo === "gastos_pessoais" ? "text-gray-200" : ""}`}>{brl(v.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })()}
        <Card className={tipo === "gastos_pessoais" ? "border border-[#1e3a5f] bg-white/5 backdrop-blur-md rounded-none" : ""}>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className={tipo === "gastos_pessoais" ? "border-b border-[#1e3a5f] hover:bg-transparent" : ""}>
                  {tipo === "gastos_pessoais" && (<>
                    <TableHead className="text-[#39FF14] uppercase tracking-widest text-[10px]">Quem recebeu</TableHead>
                    <TableHead className="text-[#39FF14] uppercase tracking-widest text-[10px]">Recebedor</TableHead>
                    <TableHead className="text-[#39FF14] uppercase tracking-widest text-[10px]">Valor</TableHead>
                    <TableHead className="text-[#39FF14] uppercase tracking-widest text-[10px]">Tipo de gasto</TableHead>
                    <TableHead className="text-[#39FF14] uppercase tracking-widest text-[10px]">Destinação</TableHead>
                    <TableHead className="text-[#39FF14] uppercase tracking-widest text-[10px]">Descrição</TableHead>
                  </>)}
                  {tipo === "contratacao" && (<>
                    <TableHead>Gerente</TableHead>
                    <TableHead>Candidatos</TableHead>
                    <TableHead>Contratados</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Semana</TableHead>
                  </>)}
                  {tipo === "meta" && (<>
                    <TableHead>Gerente</TableHead>
                    <TableHead>Arquivo</TableHead>
                  </>)}
                  {tipo === "leads" && (<>
                    <TableHead>Superintendente</TableHead>
                    <TableHead>Gerente</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead>Semana</TableHead>
                    <TableHead>Mês</TableHead>
                  </>)}
                  {tipo === "planejamento" && (<>
                    <TableHead>Seção</TableHead>
                    <TableHead>Gerente</TableHead>
                    <TableHead>Plantão</TableHead>
                    <TableHead className="text-right">Meta Ger.</TableHead>
                    <TableHead className="text-right">Meta Sup.</TableHead>
                    <TableHead className="text-right">V. Cury</TableHead>
                    <TableHead className="text-right">V. Ger.</TableHead>
                    <TableHead className="text-right">V. Sup.</TableHead>
                  </>)}
                  {/* Data/Hora apenas em Verba Cury */}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancsView.length === 0 ? (
                  <TableRow><TableCell colSpan={tipo === "gastos_pessoais" ? 7 : tipo === "contratacao" ? 6 : tipo === "leads" ? 7 : tipo === "meta" ? 3 : 5} className="py-8 text-center text-muted-foreground">Nenhum lançamento ainda</TableCell></TableRow>
                ) : lancsView.map((l) => (
                  <TableRow key={l.id} className={tipo === "gastos_pessoais" ? "border-b border-[#1e3a5f]/40 hover:bg-[#39FF14]/5" : ""}>
                    {tipo === "gastos_pessoais" && (<>
                      <TableCell className="text-gray-300">{l.quem_pagou || "—"}</TableCell>
                      <TableCell className="font-medium text-gray-200">{l.nome_recebedor || "—"}</TableCell>
                      <TableCell className="text-gray-300">{brl(Number(l.valor))}</TableCell>
                      <TableCell className="text-gray-300">{l.tipo_gasto || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={(l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto)) === "Gerar Venda" ? "default" : "secondary"}
                          className={
                            (l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto)) === "Gerar Venda"
                              ? "rounded-none bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/40 uppercase tracking-widest text-[10px]"
                              : "rounded-none bg-sky-500/10 text-sky-300 border border-sky-500/40 uppercase tracking-widest text-[10px]"
                          }
                        >
                          {l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">{l.descricao || "—"}</TableCell>
                    </>)}
                    {tipo === "contratacao" && (<>
                      <TableCell className="font-medium">{l.gerente || "—"}</TableCell>
                      <TableCell>{l.candidatos ?? "—"}</TableCell>
                      <TableCell className="text-emerald-700 font-medium">{l.contratados ?? "—"}</TableCell>
                      <TableCell>{l.fonte || "—"}</TableCell>
                      <TableCell>{l.semana_inicio ? (() => {
                        const [y, m, d] = l.semana_inicio.split("-").map(Number);
                        const ini = new Date(y, m - 1, d);
                        const fim = new Date(y, m - 1, d + 6);
                        const f = (dt: Date) => `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
                        return `${f(ini)} a ${f(fim)}`;
                      })() : "—"}</TableCell>
                    </>)}
                    {tipo === "meta" && (<>
                      <TableCell className="font-medium">{l.gerente || "—"}</TableCell>
                      <TableCell>
                        {l.comprovante_url ? (
                          <Button variant="default" size="sm" onClick={() => visualizarUnificado(l)} disabled={generatingId === l.id}>
                            <Eye className="h-3 w-3" /> {generatingId === l.id ? "Gerando..." : "Ver arquivo"}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sem arquivo</span>
                        )}
                      </TableCell>
                    </>)}
                    {tipo === "leads" && (<>
                      <TableCell className="font-medium">{l.superintendente || "—"}</TableCell>
                      <TableCell>{l.gerente || "—"}</TableCell>
                      <TableCell>{l.produto || "—"}</TableCell>
                      <TableCell className="text-right text-emerald-700 font-semibold">{l.leads ?? "—"}</TableCell>
                      <TableCell>{l.semana_inicio ? fmtDate(l.semana_inicio) : "—"}</TableCell>
                      <TableCell>{l.mes_ref ? `${String(l.mes_ref).padStart(2, "0")}/${l.ano_ref ?? ""}` : "—"}</TableCell>
                    </>)}
                    {tipo === "planejamento" && (<>
                      <TableCell className="text-xs uppercase">{l.secao || "—"}</TableCell>
                      <TableCell className="font-medium">{l.gerente || "—"}</TableCell>
                      <TableCell>{l.plantao || "—"}</TableCell>
                      <TableCell className="text-right">{l.meta_gerente != null ? Number(l.meta_gerente).toLocaleString("pt-BR") : "—"}</TableCell>
                      <TableCell className="text-right">{l.meta_sup != null ? Number(l.meta_sup).toLocaleString("pt-BR") : "—"}</TableCell>
                      <TableCell className="text-right">{l.verba_cury != null ? brl(Number(l.verba_cury)) : "—"}</TableCell>
                      <TableCell className="text-right">{l.verba_gerente != null ? brl(Number(l.verba_gerente)) : "—"}</TableCell>
                      <TableCell className="text-right">{l.verba_superintendente != null ? brl(Number(l.verba_superintendente)) : "—"}</TableCell>
                    </>)}
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={!canEditWrite}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className={isCyber ? "verba-cyber" : ""}>
                          <AlertDialogHeader>
                            <AlertDialogTitle className={isCyber ? "text-[#39FF14] uppercase tracking-[0.25em] text-sm" : ""}>
                              {isCyber ? "// EXCLUIR LANÇAMENTO" : "Excluir lançamento?"}
                            </AlertDialogTitle>
                            <AlertDialogDescription className={isCyber ? "text-gray-400 normal-case tracking-normal" : ""}>
                              {isCyber
                                ? `Esta ação não pode ser desfeita. O lançamento de ${l.nome_recebedor} (${brl(Number(l.valor))}) será removido permanentemente.`
                                : "Esta ação não pode ser desfeita."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className={isCyber ? "rounded-none bg-black border border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white uppercase tracking-widest text-[11px]" : ""}>
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteLancamento(l.id)}
                              className={isCyber ? "rounded-none bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-black font-bold uppercase tracking-widest text-xs" : ""}
                            >
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
          </CardContent>
        </Card>
        </>
      )}

      <Dialog open={reprovarOpen} onOpenChange={setReprovarOpen}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto ${isCyber ? "verba-cyber" : ""}`}>
          <DialogHeader>
            <DialogTitle className={isCyber ? "text-[#39FF14] uppercase tracking-[0.25em]" : ""}>
              {isCyber ? "// REPROVAR LANÇAMENTO" : "Reprovar Lançamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className={isCyber ? "text-gray-400 uppercase tracking-widest text-[10px]" : ""}>Motivo da reprovação</Label>
              <Textarea
                value={reprovarMotivo}
                onChange={(e) => setReprovarMotivo(e.target.value)}
                placeholder="Descreva o motivo da reprovação..."
                className={isCyber ? "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0" : ""}
              />
            </div>
            <Button
              onClick={handleReprovar}
              className={isCyber ? "w-full rounded-none bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-black font-bold uppercase tracking-widest text-xs" : "w-full"}
            >
              REPROVAR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Documentos do lançamento</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <>
              <iframe src={previewUrl} className="flex-1 w-full rounded border" title="PDF unificado" />
              <div className="flex justify-end gap-2">
                <a href={previewUrl} download="documentos.pdf"><Button variant="outline">Baixar PDF</Button></a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
