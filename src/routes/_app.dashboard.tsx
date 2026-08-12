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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Plus, FileText, Trash2 } from "lucide-react";
import { StatusBadge } from "@/lib/status";
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
  TIPOS_FORMULARIO,
  TIPOS_GASTO,
  type TipoFormulario,
  tipoLabel,
  destinacaoFromTipoGasto,
} from "@/lib/form-types";
import { useHierarquia } from "@/hooks/useHierarquia";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { VerbaCuryHistorico } from "@/components/VerbaCuryHistorico";
import { PlanejamentoHistorico } from "@/components/PlanejamentoHistorico";
import { contabilPlanejamentoResumo } from "@/functions/contabil.functions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/_app/dashboard")({
  validateSearch: (s: Record<string, unknown>) => ({
    tipo: typeof s.tipo === "string" ? s.tipo : undefined,
  }),
  head: () => ({
    meta: [
      { title: "// Nova Prestação — DIRETORIA GORRÃO" },
      {
        name: "description",
        content:
          "Acompanhe e gerencie prestações de contas, verbas e relatórios da Diretoria Gorrão.",
      },
      { property: "og:title", content: "// Nova Prestação — DIRETORIA GORRÃO" },
      {
        property: "og:description",
        content:
          "Acompanhe e gerencie prestações de contas, verbas e relatórios da Diretoria Gorrão.",
      },
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
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function Dashboard() {
  const {
    user,
    session,
    role,
    nome: nomeUsuario,
    cargo,
    canEdit,
    isAdmin,
    isDiretor,
    isRH,
    vinculadoId,
  } = useAuth();
  const { setActiveFormType } = useActiveFormType();
  const [vinculadoNome, setVinculadoNome] = useState<string | null>(null);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [forms, setForms] = useState<Form[]>([]);
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string }>>([]);
  const [disponivelMap, setDisponivelMap] = useState<Record<string, number>>({});
  const [gerentesMap, setGerentesMap] = useState<Record<string, string[]>>({});
  const [planMap, setPlanMap] = useState<
    Record<
      string,
      {
        sup: string | null;
        metaSup: number;
        verbaTotal: number;
        corretoresAcelera: number;
        investimentoEquipe: number;
        aceleraPlanejado: number;
        gerentesAcelera: string[];
        supsAcelera: string[];
        pacotes: Record<string, number>;
        metasGerentes: Record<string, number>;
        verbasGerentes: Record<string, number>;
        aceleraValores: { corretores: number; gerentes: number; sups: number; total: number };
        plantoes: Array<{ plantao: string; sup: string; planejado: number }>;
      }
    >
  >({});
  const [gastosMap, setGastosMap] = useState<
    Record<string, { gv: number; mn: number; total: number }>
  >({});
  const [gastosPorTipoMap, setGastosPorTipoMap] = useState<
    Record<string, Record<string, { gv: number; mn: number; total: number }>>
  >({});
  const [contratacaoMap, setContratacaoMap] = useState<
    Record<string, { candidatos: number; contratados: number; total: number }>
  >({});
  const [contabilResumo, setContabilResumo] = useState<{
    quantidade: number;
    vgv: number;
    pvs: number;
    porDiretor: Record<string, number>;
    porSup: Record<string, number>;
    porGerente: Record<string, number>;
    porPlantao: Record<string, number>;
  }>({ quantidade: 0, vgv: 0, pvs: 0, porDiretor: {}, porSup: {}, porGerente: {}, porPlantao: {} });
  const [open, setOpen] = useState(false);
  const tipoAtivo = (search.tipo as TipoFormulario | undefined) || "verba_cury";
  const filtraMesAtualPorPadrao = tipoAtivo === "planejamento" || tipoAtivo === "verba_cury";
  const [filtroMes, setFiltroMes] = useState<string>(() =>
    filtraMesAtualPorPadrao ? String(new Date().getMonth() + 1) : "todos",
  );
  const [filtroAno, setFiltroAno] = useState<string>(() =>
    filtraMesAtualPorPadrao ? String(new Date().getFullYear()) : "todos",
  );
  const [filtroSup, setFiltroSup] = useState<string>("todos");
  const [filtroGerente, setFiltroGerente] = useState<string>("todos");
  const [filtroDiretor, setFiltroDiretor] = useState<string>("todos");
  const [filtroTipoGasto, setFiltroTipoGasto] = useState<string>("todos");
  const [filtroDestinacaoGasto, setFiltroDestinacaoGasto] = useState<
    "todos" | "gerar_venda" | "manutencao"
  >("todos");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const filtrosRef = useRef<HTMLDivElement>(null);
  const {
    diretores,
    supsByDiretorNome,
    gerentesBySupNome,
    gerentesByDiretorSup,
    superintendentes,
    gerentes,
  } = useHierarquia();
  const tipo = tipoAtivo;
  const cyberAtivo =
    tipoAtivo === "verba_cury" ||
    tipoAtivo === "planejamento" ||
    tipoAtivo === "gastos_pessoais" ||
    tipoAtivo === "contratacao";
  const cyberTipo =
    tipo === "verba_cury" ||
    tipo === "planejamento" ||
    tipo === "gastos_pessoais" ||
    tipo === "contratacao";
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
      // O PostgREST limita cada resposta a 1.000 linhas. Planejamentos
      // históricos podem ultrapassar esse volume, então carregamos todos os
      // lançamentos em páginas e dividimos a lista de formulários para não
      // estourar o tamanho máximo da URL do filtro `in`.
      const ls: any[] = [];
      const tamanhoPagina = 1000;
      const tamanhoLoteFormularios = 100;
      for (let inicioLote = 0; inicioLote < ids.length; inicioLote += tamanhoLoteFormularios) {
        const idsDoLote = ids.slice(inicioLote, inicioLote + tamanhoLoteFormularios);
        for (let inicioPagina = 0; ; inicioPagina += tamanhoPagina) {
          const { data: pagina, error: lancamentosError } = await supabase
            .from("lancamentos")
            .select(
              "id,formulario_id,valor,reprovado,gerente,superintendente,meta_sup,verba_cury,verba_gerente,verba_superintendente,meta_gerente,secao,nome_recebedor,plantao,destinacao,tipo_gasto,candidatos,contratados",
            )
            .in("formulario_id", idsDoLote)
            .order("id", { ascending: true })
            .range(inicioPagina, inicioPagina + tamanhoPagina - 1);
          if (lancamentosError) return toast.error(lancamentosError.message);
          ls.push(...(pagina || []));
          if (!pagina || pagina.length < tamanhoPagina) break;
        }
      }
      const used: Record<string, number> = {};
      const gMap: Record<string, Set<string>> = {};
      const planAgg: Record<
        string,
        {
          sup: string | null;
          metaSup: number;
          verbaTotal: number;
          investimentoEquipe: number;
          aceleraPlanejado: number;
          corretores: Set<string>;
          gerentes: Set<string>;
          sups: Set<string>;
          pacotes: Record<string, number>;
          metasGerentes: Record<string, number>;
          verbasGerentes: Record<string, number>;
          aceleraValores: { corretores: number; gerentes: number; sups: number; total: number };
          plantoes: Array<{ plantao: string; sup: string; planejado: number }>;
        }
      > = {};
      const planIds = new Set(list.filter((f) => f.tipo === "planejamento").map((f) => f.id));
      const gastosIds = new Set(list.filter((f) => f.tipo === "gastos_pessoais").map((f) => f.id));
      const gastosAgg: Record<string, { gv: number; mn: number; total: number }> = {};
      const gastosPorTipoAgg: Record<
        string,
        Record<string, { gv: number; mn: number; total: number }>
      > = {};
      const contratacaoIds = new Set(list.filter((f) => f.tipo === "contratacao").map((f) => f.id));
      const contratacaoAgg: Record<
        string,
        { candidatos: number; contratados: number; total: number }
      > = {};
      ls.forEach((l: any) => {
        if (!l.reprovado) used[l.formulario_id] = (used[l.formulario_id] || 0) + Number(l.valor);
        if (l.gerente) {
          (gMap[l.formulario_id] ||= new Set<string>()).add(l.gerente);
        }
        if (gastosIds.has(l.formulario_id) && !l.reprovado) {
          const cur = (gastosAgg[l.formulario_id] ||= { gv: 0, mn: 0, total: 0 });
          const v = Number(l.valor || 0);
          const dest = l.destinacao || destinacaoFromTipoGasto(l.tipo_gasto);
          if (dest === "Gerar Venda") cur.gv += v;
          else cur.mn += v;
          cur.total += v;
          if (l.tipo_gasto) {
            const porFormulario = (gastosPorTipoAgg[l.formulario_id] ||= {});
            const porTipo = (porFormulario[l.tipo_gasto] ||= { gv: 0, mn: 0, total: 0 });
            if (dest === "Gerar Venda") porTipo.gv += v;
            else porTipo.mn += v;
            porTipo.total += v;
          }
        }
        if (contratacaoIds.has(l.formulario_id) && !l.reprovado) {
          const cur = (contratacaoAgg[l.formulario_id] ||= {
            candidatos: 0,
            contratados: 0,
            total: 0,
          });
          const c = Number(l.candidatos || 0);
          const ct = Number(l.contratados || 0);
          cur.candidatos += c;
          cur.contratados += ct;
          cur.total += c + ct;
        }
        if (planIds.has(l.formulario_id)) {
          const cur = (planAgg[l.formulario_id] ||= {
            sup: null,
            metaSup: 0,
            verbaTotal: 0,
            investimentoEquipe: 0,
            aceleraPlanejado: 0,
            corretores: new Set<string>(),
            gerentes: new Set<string>(),
            sups: new Set<string>(),
            pacotes: {},
            metasGerentes: {},
            verbasGerentes: {},
            aceleraValores: { corretores: 0, gerentes: 0, sups: 0, total: 0 },
            plantoes: [],
          });
          if (!cur.sup && l.superintendente) cur.sup = l.superintendente;
          const sec = l.secao || "principal";
          if (sec === "principal") {
            cur.metaSup += Number(l.meta_sup || 0);
            if (l.gerente)
              cur.metasGerentes[l.gerente] =
                (cur.metasGerentes[l.gerente] || 0) + Number(l.meta_gerente || 0);
            if (l.plantao)
              cur.plantoes.push({
                plantao: l.plantao,
                sup: l.superintendente || cur.sup || "Sem superintendente",
                planejado: Number(l.meta_sup || 0),
              });
          }
          if (sec === "verba") {
            const verbaLinha =
              Number(l.verba_cury || 0) +
              Number(l.verba_gerente || 0) +
              Number(l.verba_superintendente || 0);
            cur.verbaTotal += verbaLinha;
            cur.investimentoEquipe += verbaLinha;
            if (l.gerente)
              cur.verbasGerentes[l.gerente] = (cur.verbasGerentes[l.gerente] || 0) + verbaLinha;
          }
          if (sec === "acelera") {
            if (l.nome_recebedor) cur.corretores.add(l.nome_recebedor);
            if (l.gerente) cur.gerentes.add(l.gerente);
            if (l.superintendente) cur.sups.add(l.superintendente);
            cur.aceleraPlanejado += Number(l.valor || 0);
            cur.aceleraValores.corretores += Number(l.verba_cury || 0);
            cur.aceleraValores.gerentes += Number(l.verba_gerente || 0);
            cur.aceleraValores.sups += Number(l.verba_superintendente || 0);
            cur.aceleraValores.total += Number(l.valor || 0);
            const pacote = String(Number(l.valor || 0));
            if (["2550", "5100", "8500", "13600", "17000"].includes(pacote))
              cur.pacotes[pacote] = (cur.pacotes[pacote] || 0) + 1;
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
      Object.entries(gMap).forEach(([k, v]) => {
        gOut[k] = Array.from(v);
      });
      setGerentesMap(gOut);
      const pOut: typeof planMap = {};
      Object.entries(planAgg).forEach(([k, v]) => {
        pOut[k] = {
          sup: v.sup,
          metaSup: v.metaSup,
          verbaTotal: v.verbaTotal,
          corretoresAcelera: v.corretores.size,
          investimentoEquipe: v.investimentoEquipe,
          aceleraPlanejado: v.aceleraPlanejado,
          gerentesAcelera: Array.from(v.gerentes),
          supsAcelera: Array.from(v.sups),
          pacotes: v.pacotes,
          metasGerentes: v.metasGerentes,
          verbasGerentes: v.verbasGerentes,
          aceleraValores: v.aceleraValores,
          plantoes: v.plantoes,
        };
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

  useEffect(() => {
    if (
      tipoAtivo !== "planejamento" ||
      !session?.access_token ||
      filtroMes === "todos" ||
      filtroAno === "todos"
    ) {
      setContabilResumo({
        quantidade: 0,
        vgv: 0,
        pvs: 0,
        porDiretor: {},
        porSup: {},
        porGerente: {},
        porPlantao: {},
      });
      return;
    }
    const diretorId =
      filtroDiretor === "todos"
        ? null
        : diretores.find((item) => item.nome === filtroDiretor)?.id || null;
    const supId =
      filtroSup === "todos"
        ? null
        : superintendentes.find((item) => item.nome === filtroSup)?.id || null;
    const gerenteId =
      filtroGerente === "todos"
        ? null
        : gerentes.find((item) => item.nome === filtroGerente)?.id || null;
    void contabilPlanejamentoResumo({
      data: {
        token: session.access_token,
        mes: Number(filtroMes),
        ano: Number(filtroAno),
        diretor_id: diretorId,
        superintendente_id: supId,
        gerente_id: gerenteId,
      },
    })
      .then((result) => setContabilResumo(result))
      .catch((error) => {
        setContabilResumo({
          quantidade: 0,
          vgv: 0,
          pvs: 0,
          porDiretor: {},
          porSup: {},
          porGerente: {},
          porPlantao: {},
        });
        toast.error(
          error instanceof Error ? error.message : "Erro ao carregar o realizado contábil",
        );
      });
  }, [
    tipoAtivo,
    session?.access_token,
    filtroMes,
    filtroAno,
    filtroDiretor,
    filtroSup,
    filtroGerente,
    diretores,
    superintendentes,
    gerentes,
  ]);

  // Load vinculado profile name when current user is RH
  useEffect(() => {
    (async () => {
      if (!isRH || !vinculadoId) {
        setVinculadoNome(null);
        return;
      }
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
      const fallback = isRH ? vinculadoNome || "" : nomeUsuario || "";
      if (fallback && !nome) setNome(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipo, nomeUsuario, isRH, vinculadoNome]);

  // Reset filters when switching form type from sidebar
  useEffect(() => {
    const dataAtual = new Date();
    const usarMesAtual = tipoAtivo === "planejamento" || tipoAtivo === "verba_cury";
    setFiltroMes(usarMesAtual ? String(dataAtual.getMonth() + 1) : "todos");
    setFiltroAno(usarMesAtual ? String(dataAtual.getFullYear()) : "todos");
    setFiltroDiretor("todos");
    setFiltroSup("todos");
    setFiltroGerente("todos");
    setFiltroTipoGasto("todos");
    setFiltroDestinacaoGasto("todos");
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
    const gastos =
      filtroTipoGasto === "todos"
        ? gastosMap[formularioId] || { gv: 0, mn: 0, total: 0 }
        : gastosPorTipoMap[formularioId]?.[filtroTipoGasto] || { gv: 0, mn: 0, total: 0 };
    if (filtroDestinacaoGasto === "gerar_venda") return { gv: gastos.gv, mn: 0, total: gastos.gv };
    if (filtroDestinacaoGasto === "manutencao") return { gv: 0, mn: gastos.mn, total: gastos.mn };
    return gastos;
  };

  const formsFiltrados = forms.filter(
    (f) =>
      (f.tipo || "verba_cury") === tipoAtivo &&
      (filtroMes === "todos" || String(f.mes_referencia ?? "") === filtroMes) &&
      (filtroAno === "todos" || String(f.ano_referencia ?? "") === filtroAno) &&
      (filtroDiretor === "todos" ||
        (() => {
          if ((f.diretor ?? "") === filtroDiretor) return true;
          const supName = (f.superintendente ?? "").trim();
          if (!supName) return false;
          const dir = diretores.find((d) => d.nome === filtroDiretor);
          if (!dir) return false;
          return superintendentes.some((s) => s.nome === supName && s.diretor_id === dir.id);
        })()) &&
      (filtroSup === "todos" || (f.superintendente ?? "") === filtroSup) &&
      (filtroGerente === "todos" || (gerentesMap[f.id] || []).includes(filtroGerente)) &&
      (tipoAtivo !== "gastos_pessoais" ||
        filtroTipoGasto === "todos" ||
        Boolean(gastosPorTipoMap[f.id]?.[filtroTipoGasto])) &&
      (tipoAtivo !== "gastos_pessoais" ||
        filtroDestinacaoGasto === "todos" ||
        gastosDoFormulario(f.id).total !== 0),
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
  const categoriasGastosValidadas = Object.entries(
    formsFiltrados
      .filter((formulario) => (formulario.status || "editando") === "validado")
      .reduce(
        (categorias, formulario) => {
          Object.entries(gastosPorTipoMap[formulario.id] || {}).forEach(([categoria, valores]) => {
            if (filtroTipoGasto !== "todos" && categoria !== filtroTipoGasto) return;
            const valor =
              filtroDestinacaoGasto === "gerar_venda"
                ? valores.gv
                : filtroDestinacaoGasto === "manutencao"
                  ? valores.mn
                  : valores.total;
            categorias[categoria] = (categorias[categoria] || 0) + valor;
          });
          return categorias;
        },
        {} as Record<string, number>,
      ),
  )
    .filter(([, valor]) => valor > 0)
    .sort((a, b) => b[1] - a[1]);

  const resumoContratacaoValidado = formsFiltrados
    .filter((formulario) => (formulario.status || "editando") === "validado")
    .reduce(
      (acumulado, formulario) => {
        const contratacao = contratacaoMap[formulario.id] || {
          candidatos: 0,
          contratados: 0,
          total: 0,
        };
        acumulado.candidatos += contratacao.candidatos;
        acumulado.contratados += contratacao.contratados;
        if (formulario.diretor) acumulado.diretorias.add(formulario.diretor);
        acumulado.quantidade += 1;
        return acumulado;
      },
      { candidatos: 0, contratados: 0, diretorias: new Set<string>(), quantidade: 0 },
    );

  const resumoPlanejamentoValidado = formsFiltrados
    .filter((formulario) => (formulario.status || "editando") === "validado")
    .reduce(
      (resumo, formulario) => {
        const plano = planMap[formulario.id];
        if (!plano) return resumo;
        resumo.metaPlanejada += plano.metaSup;
        resumo.verbaPlanejada += plano.verbaTotal;
        resumo.investimentoEquipe += plano.investimentoEquipe;
        resumo.aceleraPlanejado += plano.aceleraPlanejado;
        resumo.corretores += plano.corretoresAcelera;
        plano.gerentesAcelera.forEach((nome) => resumo.gerentes.add(nome));
        plano.supsAcelera.forEach((nome) => resumo.sups.add(nome));
        resumo.valoresAcelera.corretores += plano.aceleraValores.corretores;
        resumo.valoresAcelera.gerentes += plano.aceleraValores.gerentes;
        resumo.valoresAcelera.sups += plano.aceleraValores.sups;
        resumo.valoresAcelera.total += plano.aceleraValores.total;
        Object.entries(plano.pacotes).forEach(([pacote, quantidade]) => {
          resumo.pacotes[pacote] = (resumo.pacotes[pacote] || 0) + quantidade;
        });
        plano.plantoes.forEach((linha) => {
          const plantao = resumo.plantoes.get(linha.plantao) || new Map<string, number>();
          plantao.set(linha.sup, (plantao.get(linha.sup) || 0) + linha.planejado);
          resumo.plantoes.set(linha.plantao, plantao);
        });
        resumo.quantidade += 1;
        return resumo;
      },
      {
        metaPlanejada: 0,
        metaRealizada: 0,
        verbaPlanejada: 0,
        verbaRealizada: 0,
        investimentoEquipe: 0,
        aceleraPlanejado: 0,
        aceleraRealizado: 0,
        corretores: 0,
        gerentes: new Set<string>(),
        sups: new Set<string>(),
        valoresAcelera: { corretores: 0, gerentes: 0, sups: 0, total: 0 },
        pacotes: {} as Record<string, number>,
        plantoes: new Map<string, Map<string, number>>(),
        quantidade: 0,
      },
    );
  resumoPlanejamentoValidado.metaRealizada = contabilResumo.quantidade;

  const normalizaNome = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  const usuarioSuperintendente = cargo === "superintendente";
  const diretorVisivel = isDiretor ? nomeUsuario || "todos" : filtroDiretor;
  const supersDaDiretoria = supsByDiretorNome(diretorVisivel).filter(
    (sup) => !normalizaNome(sup.nome).includes("PROCESSOS INTERNOS"),
  );
  const supAtual = superintendentes.find(
    (sup) =>
      sup.id === (vinculadoId || user?.id) ||
      normalizaNome(sup.nome) === normalizaNome(nomeUsuario || ""),
  );
  const entidadesPlanejamentoBase =
    usuarioSuperintendente && supAtual
      ? gerentesBySupNome(supAtual.nome)
      : [
          ...supersDaDiretoria,
          ...Object.keys(contabilResumo.porSup)
            .filter(
              (nome) =>
                !supersDaDiretoria.some((sup) => normalizaNome(sup.nome) === normalizaNome(nome)),
            )
            .map((nome) => ({ id: `contabil-${normalizaNome(nome)}`, nome, diretor_id: null })),
        ];
  const entidadesPlanejamento = entidadesPlanejamentoBase.map((pessoa) => {
    const chave = normalizaNome(pessoa.nome);
    const formularioPertence = (formulario: Form) => {
      const plano = planMap[formulario.id];
      if (usuarioSuperintendente)
        return Object.keys(plano?.metasGerentes || {}).some(
          (gerente) => normalizaNome(gerente) === chave,
        );
      return normalizaNome(
        plano?.sup || formulario.superintendente || formulario.nome || "",
      ).includes(chave);
    };
    const formularios = formsFiltrados.filter(formularioPertence);
    const formulariosValidados = formularios.filter(
      (formulario) => (formulario.status || "editando") === "validado",
    );
    const planejado = formulariosValidados.reduce((total, formulario) => {
      const plano = planMap[formulario.id];
      if (usuarioSuperintendente) {
        return (
          total +
          Object.entries(plano?.metasGerentes || {}).reduce(
            (soma, [gerente, meta]) => (normalizaNome(gerente) === chave ? soma + meta : soma),
            0,
          )
        );
      }
      const responsavel = normalizaNome(
        plano?.sup || formulario.superintendente || formulario.nome || "",
      );
      return responsavel.includes(chave) ? total + (plano?.metaSup || 0) : total;
    }, 0);
    const verbaPlanejada = formulariosValidados.reduce((total, formulario) => {
      const plano = planMap[formulario.id];
      if (!usuarioSuperintendente) return total + (plano?.verbaTotal || 0);
      return (
        total +
        Object.entries(plano?.verbasGerentes || {}).reduce(
          (soma, [gerente, verba]) => (normalizaNome(gerente) === chave ? soma + verba : soma),
          0,
        )
      );
    }, 0);
    const realizado = usuarioSuperintendente
      ? Object.entries(contabilResumo.porGerente).reduce(
          (total, [gerente, quantidade]) =>
            normalizaNome(gerente) === chave ? total + quantidade : total,
          0,
        )
      : Object.entries(contabilResumo.porSup).reduce(
          (total, [sup, quantidade]) => (normalizaNome(sup) === chave ? total + quantidade : total),
          0,
        );
    return {
      nome: pessoa.nome,
      planejado,
      realizado,
      percentual: planejado > 0 ? (realizado / planejado) * 100 : 0,
      verbaPlanejada,
      quantidadeValidada: formulariosValidados.length,
      formularios,
    };
  });
  const supersVisiveisVerba = usuarioSuperintendente && supAtual ? [supAtual] : supersDaDiretoria;
  const entidadesVerbaCury = supersVisiveisVerba.map((sup) => {
    const chave = normalizaNome(sup.nome);
    const formularios = formsFiltrados.filter((formulario) => {
      const responsavel = normalizaNome(
        formulario.superintendente ||
          formulario.nome ||
          usuarios.find((usuario) => usuario.id === formulario.usuario_id)?.nome ||
          "",
      );
      return formulario.usuario_id === sup.id || responsavel.includes(chave);
    });
    const formulariosValidados = formularios.filter(
      (formulario) => (formulario.status || "editando") === "validado",
    );
    const totalMeses = new Set(
      formulariosValidados.map(
        (formulario) => `${formulario.ano_referencia || 0}-${formulario.mes_referencia || 0}`,
      ),
    ).size;
    const totalVerba = formulariosValidados.reduce(
      (total, formulario) =>
        total + Number(formulario.valor_agilitas || 0) + Number(formulario.valor_marketing || 0),
      0,
    );
    return {
      nome: sup.nome,
      formularios,
      totalMeses,
      totalVerba,
      mediaMensal: totalMeses > 0 ? totalVerba / totalMeses : 0,
    };
  });
  const entidadesGastosPessoais = supersVisiveisVerba.map((sup) => {
    const chave = normalizaNome(sup.nome);
    const formularios = formsFiltrados.filter((formulario) => {
      const responsavel = normalizaNome(
        formulario.superintendente ||
          formulario.responsavel ||
          formulario.nome ||
          usuarios.find((usuario) => usuario.id === formulario.usuario_id)?.nome ||
          "",
      );
      return formulario.usuario_id === sup.id || responsavel.includes(chave);
    });
    const formulariosValidados = formularios.filter(
      (formulario) => (formulario.status || "editando") === "validado",
    );
    const totais = formulariosValidados.reduce(
      (acc, formulario) => {
        const gastos = gastosDoFormulario(formulario.id);
        acc.gerarVenda += gastos.gv;
        acc.manutencao += gastos.mn;
        acc.total += gastos.total;
        return acc;
      },
      { gerarVenda: 0, manutencao: 0, total: 0 },
    );
    const totalMeses = new Set(
      formulariosValidados.map(
        (formulario) => `${formulario.ano_referencia || 0}-${formulario.mes_referencia || 0}`,
      ),
    ).size;
    return {
      nome: sup.nome,
      formularios,
      ...totais,
      mediaMensal: totalMeses > 0 ? totais.total / totalMeses : 0,
    };
  });

  const verbasPorResponsavel = Array.from(
    formsFiltrados.reduce((grupos, formulario) => {
      const nomeResponsavel =
        formulario.nome ||
        usuarios.find((usuario) => usuario.id === formulario.usuario_id)?.nome ||
        formulario.superintendente ||
        formulario.diretor ||
        "Sem responsável";
      const chave = formulario.usuario_id || nomeResponsavel;
      const grupo = grupos.get(chave) || {
        chave,
        nome: nomeResponsavel,
        formularios: [] as Form[],
      };
      grupo.formularios.push(formulario);
      grupos.set(chave, grupo);
      return grupos;
    }, new Map<string, { chave: string; nome: string; formularios: Form[] }>()),
  )
    .map(([, grupo]) => grupo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

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
    if (isContratacao && !diretor) {
      setBusy(false);
      return toast.error("Selecione a diretoria.");
    }
    // Admin pode criar formulários em nome de qualquer usuário (sup/gerente/etc)
    const adminTarget = isAdmin && nome ? usuarios.find((u) => u.nome === nome) : null;
    const effectiveOwnerId = adminTarget
      ? adminTarget.id
      : isRH && vinculadoId
        ? vinculadoId
        : user!.id;
    const effectiveOwnerNome = adminTarget
      ? adminTarget.nome
      : isRH
        ? vinculadoNome || ""
        : nomeUsuario || "";
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
      ? nome || effectiveOwnerNome || ""
      : isGastos
        ? effectiveOwnerNome || ""
        : isContratacao
          ? effectiveOwnerNome || ""
          : nome;
    const segments = [{ mes: Number(mes), ano: Number(ano), semana_inicio: null as string | null }];
    const usaMesAno =
      isVerba ||
      isMeta ||
      isGastos ||
      isContratacao ||
      tipo === "planejamento" ||
      tipo === "leads" ||
      isAcelera;
    const rows = segments.map((seg) => ({
      usuario_id: effectiveOwnerId,
      tipo,
      tipo_verba: isVerba ? tipoVerba : "cury",
      nome: nomeFinal || null,
      diretor: isContratacao ? diretor || null : null,
      superintendente: isAcelera ? superintendente || null : null,
      responsavel: isGastos
        ? responsavel || effectiveOwnerNome || null
        : isRH
          ? effectiveOwnerNome || null
          : null,
      mes_referencia: usaMesAno ? seg.mes : null,
      ano_referencia: usaMesAno ? seg.ano : null,
      semana_inicio: null,
      valor_agilitas: isVerba ? Number(agilitas) || 0 : 0,
      valor_marketing: isVerba ? Number(marketing) || 0 : 0,
    }));
    const { data, error } = await supabase.from("formularios").insert(rows).select();
    setBusy(false);
    if (error) {
      if (error.code === "23505" && isVerba) {
        return toast.error(
          `Já existe uma verba ${tipoVerba === "cury" ? "Cury" : "Campanha de Estoque"} para este responsável no mês e ano selecionados.`,
        );
      }
      return toast.error(error.message);
    }
    if (!data || data.length === 0)
      return toast.error("Não foi possível criar o formulário (verifique permissões).");
    setOpen(false);
    setNome("");
    setDiretor("");
    setSuperintendente("");
    setResponsavel("");
    setAgilitas("");
    setMarketing("");
    setTipoVerba("cury");
    setParaOutro(false);
    setSemana("");
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
      <div
        className={`relative z-30 ${tipoAtivo === "planejamento" || tipoAtivo === "gastos_pessoais" || cyberAtivo ? "flex flex-col gap-4" : "flex items-center justify-between"}`}
      >
        <div>
          {!cyberAtivo && (
            <h1 className="text-2xl font-semibold text-primary whitespace-nowrap">
              {tipoLabel(tipoAtivo)}
            </h1>
          )}
          {tipoAtivo !== "planejamento" &&
            tipoAtivo !== "gastos_pessoais" &&
            tipoAtivo !== "verba_cury" &&
            tipoAtivo !== "contratacao" && (
              <p className="text-sm text-muted-foreground">
                {TIPOS_FORMULARIO.find((t) => t.value === tipoAtivo)?.descricao}
              </p>
            )}
        </div>
        <div
          className={
            cyberAtivo ? "flex w-full items-center justify-end gap-2" : "flex items-center gap-2"
          }
        >
          {tipoAtivo === "verba_cury" && isAdmin && session?.access_token && (
            <VerbaCuryHistorico
              token={session.access_token}
              diretores={diretores}
              superintendentes={superintendentes}
              gerentes={gerentes}
              onImported={load}
            />
          )}
          {tipoAtivo === "planejamento" && isAdmin && session?.access_token && (
            <PlanejamentoHistorico
              token={session.access_token}
              diretores={diretores}
              superintendentes={superintendentes}
              gerentes={gerentes}
              onImported={load}
            />
          )}
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
                  <span
                    className={`absolute top-1/2 h-[2px] w-3.5 bg-current shadow-[0_0_5px_currentColor] transition-all duration-300 ${filtrosAbertos ? "left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" : "left-[22%] -translate-x-1/2 -translate-y-1/2 -rotate-[65deg]"}`}
                  />
                  <span
                    className={`absolute top-1/2 h-[2px] w-3.5 bg-current shadow-[0_0_5px_currentColor] transition-all duration-300 ${filtrosAbertos ? "left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" : "left-[78%] -translate-x-1/2 -translate-y-1/2 -rotate-[65deg]"}`}
                  />
                </span>
                FILTRO
              </button>
              <div
                id="dashboard-filtros"
                className={`absolute right-0 top-[calc(100%+10px)] z-50 w-72 origin-top-right border border-[#39FF14]/35 bg-black/95 p-4 shadow-[0_0_35px_rgba(57,255,20,0.14)] backdrop-blur-xl transition-all duration-200 ${filtrosAbertos ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}
              >
                <div className="mb-3 border-b border-[#39FF14]/20 pb-2 text-[9px] uppercase tracking-[0.3em] text-white/40">
                  // FILTRAR REGISTROS
                </div>
                <div className="space-y-3">
                  {[
                    <Select key="mes" value={filtroMes} onValueChange={setFiltroMes}>
                      <SelectTrigger>
                        <SelectValue placeholder="MÊS" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">TODOS OS MESES</SelectItem>
                        {MESES.map((m, i) => (
                          <SelectItem key={m} value={String(i + 1)}>
                            {m.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>,
                    <Select key="ano" value={filtroAno} onValueChange={setFiltroAno}>
                      <SelectTrigger>
                        <SelectValue placeholder="ANO" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">TODOS OS ANOS</SelectItem>
                        {Array.from(
                          new Set(
                            forms
                              .filter((f) => f.tipo === tipoAtivo)
                              .map((f) => f.ano_referencia)
                              .filter(Boolean) as number[],
                          ),
                        )
                          .sort((a, b) => b - a)
                          .map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>,
                    <Select
                      key="diretor"
                      value={filtroDiretor}
                      onValueChange={(v) => {
                        setFiltroDiretor(v);
                        setFiltroSup("todos");
                        setFiltroGerente("todos");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="DIRETOR" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">TODOS OS DIRETORES</SelectItem>
                        {diretores.map((d) => (
                          <SelectItem key={d.id} value={d.nome}>
                            {d.nome.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>,
                    <Select
                      key="sup"
                      value={filtroSup}
                      onValueChange={(v) => {
                        setFiltroSup(v);
                        setFiltroGerente("todos");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="SUPERINTENDENTE" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">TODOS OS SUP.</SelectItem>
                        {supsByDiretorNome(filtroDiretor).map((s) => (
                          <SelectItem key={s.id} value={s.nome}>
                            {s.nome.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>,
                    <Select key="gerente" value={filtroGerente} onValueChange={setFiltroGerente}>
                      <SelectTrigger>
                        <SelectValue placeholder="GERENTE" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">TODOS OS GERENTES</SelectItem>
                        {gerentesByDiretorSup(filtroDiretor, filtroSup).map((g) => (
                          <SelectItem key={g.id} value={g.nome}>
                            {g.nome.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>,
                    ...(tipoAtivo === "gastos_pessoais"
                      ? [
                          <Select
                            key="tipo-gasto"
                            value={filtroTipoGasto}
                            onValueChange={setFiltroTipoGasto}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="TIPO DE GASTO" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todos">TODOS OS TIPOS DE GASTO</SelectItem>
                              {TIPOS_GASTO.map((tipoGasto) => (
                                <SelectItem key={tipoGasto} value={tipoGasto}>
                                  {tipoGasto.toUpperCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>,
                          <Select
                            key="destinacao-gasto"
                            value={filtroDestinacaoGasto}
                            onValueChange={(valor) =>
                              setFiltroDestinacaoGasto(
                                valor as "todos" | "gerar_venda" | "manutencao",
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="DESTINAÇÃO" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todos">TODAS AS DESTINAÇÕES</SelectItem>
                              <SelectItem value="gerar_venda">GERAR VENDA</SelectItem>
                              <SelectItem value="manutencao">MANUTENÇÃO</SelectItem>
                            </SelectContent>
                          </Select>,
                        ]
                      : []),
                  ].map((controle, index) => (
                    <div
                      key={index}
                      style={{ transitionDelay: filtrosAbertos ? `${index * 45}ms` : "0ms" }}
                      className={`transition-all duration-300 [&_[role=combobox]]:h-9 [&_[role=combobox]]:w-full [&_[role=combobox]]:border-[#39FF14]/25 [&_[role=combobox]]:text-[9px] [&_[role=combobox]]:tracking-[0.18em] ${filtrosAbertos ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
                    >
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
                    {tipo === "verba_cury" ||
                    tipo === "contratacao" ||
                    (isAdmin && (tipo === "gastos_pessoais" || tipo === "planejamento")) ? (
                      <div>
                        <Label className="text-gray-400 uppercase tracking-widest text-[10px]">
                          {tipo === "contratacao" ? "Responsável" : "Quem vai prestar conta"}
                        </Label>
                        <Select
                          value={nome || (isRH ? vinculadoNome || "" : nomeUsuario || "")}
                          onValueChange={setNome}
                          disabled={!isAdmin}
                        >
                          <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]">
                            <SelectValue placeholder="SELECIONE UM USUÁRIO..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300">
                            {(isAdmin
                              ? usuarios
                              : isRH
                                ? vinculadoNome
                                  ? [{ id: vinculadoId!, nome: vinculadoNome }]
                                  : []
                                : nomeUsuario
                                  ? [{ id: user!.id, nome: nomeUsuario }]
                                  : []
                            ).map((u) => (
                              <SelectItem
                                key={u.id}
                                value={u.nome}
                                className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10"
                              >
                                {u.nome.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : tipo === "gastos_pessoais" || tipo === "planejamento" ? null : (
                      <div>
                        <Label>
                          {tipo === "meta" ? "Identificação (opcional)" : "Nome / Identificação"}
                        </Label>
                        <Input
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                          placeholder="Ex: Orçamento equipe SP"
                          required={tipo !== "meta"}
                        />
                      </div>
                    )}
                    {tipo === "contratacao" && (
                      <div>
                        <Label className="text-gray-400 uppercase tracking-widest text-[10px]">
                          Diretoria
                        </Label>
                        <Select value={diretor} onValueChange={setDiretor}>
                          <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]">
                            <SelectValue placeholder="SELECIONE A DIRETORIA..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-none border border-[#39FF14]/30 bg-black/90 backdrop-blur-xl text-gray-300">
                            {diretores.map((item) => (
                              <SelectItem
                                key={item.id}
                                value={item.nome}
                                className="rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14]"
                              >
                                {item.nome.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {tipo === "verba_cury" && (
                      <div>
                        <Label className="text-gray-400 uppercase tracking-widest text-[10px]">
                          Tipo de verba
                        </Label>
                        <Select
                          value={tipoVerba}
                          onValueChange={(value) =>
                            setTipoVerba(value as "cury" | "campanha_estoque")
                          }
                        >
                          <SelectTrigger className="rounded-none border border-[#39FF14]/30 bg-black/60 text-gray-300 uppercase tracking-widest text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
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
                        <Input
                          value={superintendente}
                          onChange={(e) => setSuperintendente(e.target.value)}
                          required
                        />
                      </div>
                    )}
                    {(cyberTipo ||
                      tipo === "meta" ||
                      tipo === "leads" ||
                      tipo === "acelera_vendas" ||
                      tipo === "contratacao") && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label
                            className={
                              cyberTipo ? "text-gray-400 uppercase tracking-widest text-[10px]" : ""
                            }
                          >
                            Mês de referência
                          </Label>
                          <Select
                            value={mes}
                            onValueChange={(v) => {
                              setMes(v);
                              setSemana("");
                            }}
                          >
                            <SelectTrigger
                              className={
                                cyberTipo
                                  ? "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"
                                  : ""
                              }
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent
                              className={
                                cyberTipo
                                  ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300"
                                  : undefined
                              }
                            >
                              {MESES.map((m, i) => (
                                <SelectItem
                                  key={i}
                                  value={String(i + 1)}
                                  className={
                                    cyberTipo
                                      ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10"
                                      : undefined
                                  }
                                >
                                  {cyberTipo ? m.toUpperCase() : m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label
                            className={
                              cyberTipo ? "text-gray-400 uppercase tracking-widest text-[10px]" : ""
                            }
                          >
                            Ano de referência
                          </Label>
                          <Select value={ano} onValueChange={setAno}>
                            <SelectTrigger
                              className={
                                cyberTipo
                                  ? "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]"
                                  : ""
                              }
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent
                              className={
                                cyberTipo
                                  ? "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300"
                                  : undefined
                              }
                            >
                              {anos.map((y) => (
                                <SelectItem
                                  key={y}
                                  value={String(y)}
                                  className={
                                    cyberTipo
                                      ? "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10"
                                      : undefined
                                  }
                                >
                                  {y}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    {tipo === "verba_cury" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-gray-400 uppercase tracking-widest text-[10px]">
                            Valor Agilitas
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={agilitas}
                            onChange={(e) => setAgilitas(e.target.value)}
                            required
                            className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0"
                          />
                        </div>
                        <div>
                          <Label className="text-gray-400 uppercase tracking-widest text-[10px]">
                            Valor Marketing
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={marketing}
                            onChange={(e) => setMarketing(e.target.value)}
                            required
                            className="rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 placeholder:text-gray-500 focus-visible:border-[#39FF14] focus-visible:ring-0"
                          />
                        </div>
                      </div>
                    )}
                    {tipo === "verba_cury" && (
                      <div className="rounded-none border border-[#39FF14]/30 bg-black/40 p-3">
                        <div className="text-[10px] text-gray-400 uppercase tracking-widest">
                          Valor Total
                        </div>
                        <div className="text-xl font-semibold text-gray-300">{brl(total)}</div>
                      </div>
                    )}
                    <Button
                      type="submit"
                      className="w-full rounded-none bg-black border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14] hover:text-black font-bold uppercase tracking-widest text-xs"
                      disabled={busy}
                    >
                      {busy ? "Salvando..." : "Salvar"}
                    </Button>
                  </form>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {tipoAtivo === "planejamento" && (
        <section className="relative z-10 border border-[#39FF14]/25 bg-black/55 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
              / / RESUMO VALIDADO
            </h2>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {resumoPlanejamentoValidado.quantidade}{" "}
              {resumoPlanejamentoValidado.quantidade === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-3">
              <div className="border border-white/10 bg-white/[0.025] p-4">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[#39FF14]">
                  Planejamento geral
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Planejado
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-white">
                      {resumoPlanejamentoValidado.metaPlanejada.toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Realizado · contábil
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-white/70">
                      {resumoPlanejamentoValidado.metaRealizada.toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      % realizado
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-[#39FF14]">
                      {(resumoPlanejamentoValidado.metaPlanejada > 0
                        ? (resumoPlanejamentoValidado.metaRealizada /
                            resumoPlanejamentoValidado.metaPlanejada) *
                          100
                        : 0
                      ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      %
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-white/10 pt-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#39FF14]/65">
                    Total de verba
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                    <div className="flex items-center gap-2 text-white/50">
                      <span>Planejada</span>
                      <strong className="font-mono text-white">
                        {brl(resumoPlanejamentoValidado.verbaPlanejada)}
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-white/50">
                      <span>Realizada</span>
                      <strong className="font-mono text-white/55">
                        {brl(resumoPlanejamentoValidado.verbaRealizada)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-white/10 bg-white/[0.025] p-4">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[#39FF14]">
                  Verba
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Investimento equipe
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-white">
                      {brl(resumoPlanejamentoValidado.investimentoEquipe)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Acelera planejado
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-white">
                      {brl(resumoPlanejamentoValidado.aceleraPlanejado)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Acelera realizado
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-white/55">
                      {brl(resumoPlanejamentoValidado.aceleraRealizado)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-4">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[#39FF14]">
                  Acelera Vendas
                </h3>
                <div className="grid gap-3 border-b border-white/10 pb-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      "Corretores",
                      resumoPlanejamentoValidado.corretores,
                      resumoPlanejamentoValidado.valoresAcelera.corretores,
                    ],
                    [
                      "Gerentes",
                      resumoPlanejamentoValidado.gerentes.size,
                      resumoPlanejamentoValidado.valoresAcelera.gerentes,
                    ],
                    [
                      "SUPs",
                      resumoPlanejamentoValidado.sups.size,
                      resumoPlanejamentoValidado.valoresAcelera.sups,
                    ],
                    [
                      "Total",
                      resumoPlanejamentoValidado.corretores +
                        resumoPlanejamentoValidado.gerentes.size +
                        resumoPlanejamentoValidado.sups.size,
                      resumoPlanejamentoValidado.valoresAcelera.total,
                    ],
                  ].map(([rotulo, participantes, valor]) => (
                    <div key={rotulo as string} className="border border-white/10 bg-black/25 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
                        {rotulo}
                      </div>
                      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                        Participantes
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#39FF14]">
                        {participantes}
                        <span className="mx-1 text-white/25">/</span>
                        <span className="text-white/50">0</span>
                      </div>
                      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                        Valor
                      </div>
                      <div className="mt-1 font-mono text-sm font-bold text-white">
                        {brl(Number(valor))}
                        <span className="mx-1 text-white/25">/</span>
                        <span className="text-white/50">{brl(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ["Pacote 2.550", resumoPlanejamentoValidado.pacotes["2550"] || 0],
                    ["Pacote 5.100", resumoPlanejamentoValidado.pacotes["5100"] || 0],
                    ["Pacote 8.500", resumoPlanejamentoValidado.pacotes["8500"] || 0],
                    ["Pacote 13.600", resumoPlanejamentoValidado.pacotes["13600"] || 0],
                    ["Pacote 17.000", resumoPlanejamentoValidado.pacotes["17000"] || 0],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo as string}>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                        {rotulo}
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#39FF14]">{valor}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative min-h-[820px]">
              <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden border border-white/10 bg-white/[0.025] p-4">
                <h3 className="mb-3 shrink-0 text-[10px] font-bold uppercase tracking-[0.24em] text-[#39FF14]">
                  Plantão
                </h3>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                  {resumoPlanejamentoValidado.plantoes.size === 0 ? (
                    <div className="border border-dashed border-white/10 p-6 text-center text-[10px] uppercase tracking-widest text-white/35">
                      Nenhum plantão validado
                    </div>
                  ) : (
                    <Accordion type="multiple" className="space-y-2">
                      {Array.from(resumoPlanejamentoValidado.plantoes.entries())
                        .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
                        .map(([plantao, sups]) => {
                          const totalPlantao = Array.from(sups.values()).reduce(
                            (total, valor) => total + valor,
                            0,
                          );
                          const supsOrdenados = Array.from(sups.entries()).sort(([a], [b]) =>
                            a.localeCompare(b, "pt-BR"),
                          );
                          return (
                            <AccordionItem
                              key={plantao}
                              value={plantao}
                              className="border border-white/10 bg-black/30"
                            >
                              <AccordionTrigger className="gap-3 px-3 py-3 hover:no-underline [&>svg]:text-[#39FF14]">
                                <div className="min-w-0 flex-1 text-left">
                                  <strong className="block truncate text-[10px] uppercase tracking-[0.18em] text-white">
                                    {plantao}
                                  </strong>
                                </div>
                                <span className="font-mono text-xs font-bold text-[#39FF14]">
                                  {totalPlantao.toLocaleString("pt-BR")}{" "}
                                  <span className="text-white/30">/</span>{" "}
                                  {(contabilResumo.porPlantao[plantao] || 0).toLocaleString(
                                    "pt-BR",
                                    { maximumFractionDigits: 2 },
                                  )}
                                </span>
                              </AccordionTrigger>
                              <AccordionContent className="border-t border-white/10 pb-0">
                                <div className="border-b border-white/[0.06] px-3 py-2 text-[8px] uppercase tracking-[0.14em] text-white/30">
                                  {supsOrdenados.length}{" "}
                                  {supsOrdenados.length === 1
                                    ? "superintendente"
                                    : "superintendentes"}
                                </div>
                                <div className="divide-y divide-white/[0.06]">
                                  {supsOrdenados.map(([sup, planejado]) => (
                                    <div
                                      key={sup}
                                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-[10px]"
                                    >
                                      <span className="min-w-0 truncate uppercase tracking-[0.12em] text-white/55">
                                        {sup}
                                      </span>
                                      <span className="shrink-0 font-mono text-white">
                                        <span className="mr-2 text-[8px] uppercase text-white/30">
                                          Planejado
                                        </span>
                                        {planejado.toLocaleString("pt-BR")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                    </Accordion>
                  )}
                </div>
                <div className="mt-3 flex shrink-0 items-center justify-between border-t border-[#39FF14]/25 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14]">
                  <span>Total</span>
                  <span className="font-mono text-base">
                    {resumoPlanejamentoValidado.metaPlanejada.toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-[#39FF14]/20 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-[0.24em] text-[#39FF14]">
                {usuarioSuperintendente ? "Gerentes" : "Superintendentes"}
              </h3>
              <span className="text-[8px] uppercase tracking-[0.16em] text-white/40">
                Realizado · CONTÁBIL
              </span>
            </div>
            <div
              className={
                usuarioSuperintendente
                  ? "flex gap-3 overflow-x-auto pb-2"
                  : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
              }
            >
              {entidadesPlanejamento.map((sup) => (
                <button
                  key={sup.nome}
                  type="button"
                  disabled={sup.formularios.length === 0}
                  onClick={() =>
                    setResponsavelSelecionado({ nome: sup.nome, formularios: sup.formularios })
                  }
                  className={`${usuarioSuperintendente ? "w-[190px] shrink-0" : "w-full min-w-0"} border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-[#39FF14]/70 hover:bg-[#39FF14]/[0.035] disabled:cursor-default disabled:opacity-55 disabled:hover:border-white/10 disabled:hover:bg-white/[0.025]`}
                >
                  <div
                    className="truncate border-b border-white/10 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#39FF14]"
                    title={sup.nome}
                  >
                    {sup.nome}
                  </div>
                  <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.12em]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/45">Planejado</span>
                      <strong className="font-mono text-white">
                        {sup.planejado.toLocaleString("pt-BR")}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/45">Realizado</span>
                      <strong className="font-mono text-white/55">
                        {sup.realizado.toLocaleString("pt-BR")}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/45">% realizado</span>
                      <strong className="font-mono text-[#39FF14]">
                        {sup.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <span className="text-white/45">Verba planejada</span>
                      <strong className="font-mono text-white">{brl(sup.verbaPlanejada)}</strong>
                    </div>
                  </div>
                  <div className="mt-2 text-[7px] uppercase tracking-[0.12em] text-white/25">
                    {sup.formularios.length > 0 ? "Clique para escolher o mês" : "Sem planejamento"}
                  </div>
                </button>
              ))}
              {entidadesPlanejamento.length === 0 && (
                <div className="w-full border border-dashed border-white/10 p-6 text-center text-[10px] uppercase tracking-widest text-white/35">
                  Nenhum {usuarioSuperintendente ? "gerente" : "superintendente"} vinculado
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
            <div className="border border-white/10 bg-black/30 p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/40">
                PVs contabilizados
              </div>
              <div className="mt-1 font-mono text-xl text-white">
                {contabilResumo.pvs.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="border border-white/10 bg-black/30 p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/40">
                Quantidade realizada
              </div>
              <div className="mt-1 font-mono text-xl text-[#39FF14]">
                {contabilResumo.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="border border-white/10 bg-black/30 p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/40">VGV contábil</div>
              <div className="mt-1 font-mono text-xl text-[#39FF14]">{brl(contabilResumo.vgv)}</div>
            </div>
          </div>
          <p className="mt-3 text-right text-[8px] uppercase tracking-[0.16em] text-white/30">
            Fonte de leitura: CONTÁBIL · painel de controle
          </p>
        </section>
      )}

      {tipoAtivo === "verba_cury" && (
        <section className="relative z-10 border border-[#39FF14]/25 bg-black/55 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
              / / RESUMO VALIDADO
            </h2>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {resumoVerbaValidada.quantidade}{" "}
              {resumoVerbaValidada.quantidade === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">
                Total verba Agilitas
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">
                {brl(resumoVerbaValidada.agilitas)}
              </div>
            </div>
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">
                Total Marketing
              </div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">
                {brl(resumoVerbaValidada.marketing)}
              </div>
            </div>
            <div className="border border-[#39FF14]/35 bg-[#39FF14]/[0.045] p-3 shadow-[inset_0_0_20px_rgba(57,255,20,0.035)]">
              <div className="text-[9px] uppercase tracking-[0.22em] text-[#39FF14]/70">
                Total verba
              </div>
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
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
              / / RESUMO VALIDADO
            </h2>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {resumoGastosValidado.quantidade}{" "}
              {resumoGastosValidado.quantidade === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex min-h-[280px] items-center justify-center gap-8 border border-white/10 bg-white/[0.025] p-6">
              <div
                className="relative h-52 w-52 shrink-0 rounded-full border border-white/10"
                style={{
                  background:
                    resumoGastosValidado.total > 0
                      ? `conic-gradient(#39FF14 0 ${(resumoGastosValidado.gerarVenda / resumoGastosValidado.total) * 100}%, #64748b ${(resumoGastosValidado.gerarVenda / resumoGastosValidado.total) * 100}% 100%)`
                      : "#111",
                }}
              >
                <div className="absolute inset-11 flex flex-col items-center justify-center rounded-full border border-white/10 bg-black text-center">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14]/70">
                    Total
                  </span>
                  <strong className="mt-2 font-mono text-base text-[#39FF14]">
                    {brl(resumoGastosValidado.total)}
                  </strong>
                </div>
              </div>
              <div className="min-w-0 space-y-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/45">
                    <span className="h-2 w-2 bg-[#39FF14]" />
                    Gerar Venda
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-white">
                    {brl(resumoGastosValidado.gerarVenda)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/45">
                    <span className="h-2 w-2 bg-slate-500" />
                    Manutenção
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-white">
                    {brl(resumoGastosValidado.manutencao)}
                  </div>
                </div>
              </div>
            </div>
            <div className="min-h-[280px] border border-white/10 bg-white/[0.025] p-5">
              <div className="mb-3 border-b border-white/10 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#39FF14]">
                Categorias dos gastos
              </div>
              <div className="max-h-56 space-y-3 overflow-y-auto pr-2">
                {categoriasGastosValidadas.length === 0 ? (
                  <div className="py-6 text-center text-[9px] uppercase tracking-widest text-white/30">
                    Nenhuma categoria validada
                  </div>
                ) : (
                  categoriasGastosValidadas.map(([categoria, valor]) => (
                    <div
                      key={categoria}
                      className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2 text-[10px]"
                    >
                      <span className="truncate uppercase tracking-[0.12em] text-white/50">
                        {categoria}
                      </span>
                      <strong className="shrink-0 font-mono text-white">{brl(valor)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {tipoAtivo === "contratacao" && (
        <section className="relative z-10 border border-[#39FF14]/25 bg-black/55 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between border-b border-[#39FF14]/15 pb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
              / / RESUMO VALIDADO
            </h2>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {resumoContratacaoValidado.quantidade}{" "}
              {resumoContratacaoValidado.quantidade === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">Candidatos</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">
                {resumoContratacaoValidado.candidatos.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="border border-[#39FF14]/35 bg-[#39FF14]/[0.045] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-[#39FF14]/70">
                Contratados
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-[#39FF14]">
                {resumoContratacaoValidado.contratados.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="border border-white/10 bg-white/[0.025] p-3">
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/45">Diretoria</div>
              <div className="mt-1 truncate text-sm font-bold uppercase tracking-wider text-white">
                {resumoContratacaoValidado.diretorias.size === 0
                  ? "—"
                  : resumoContratacaoValidado.diretorias.size === 1
                    ? Array.from(resumoContratacaoValidado.diretorias)[0]
                    : `${resumoContratacaoValidado.diretorias.size} DIRETORIAS`}
              </div>
            </div>
          </div>
        </section>
      )}

      {formsFiltrados.length === 0 &&
      tipoAtivo !== "planejamento" &&
      tipoAtivo !== "verba_cury" &&
      tipoAtivo !== "gastos_pessoais" ? (
        <Card
          className={cyberAtivo ? "relative z-10 bg-white/[0.02] border-white/10 text-white" : ""}
        >
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText
              className={`h-10 w-10 ${cyberAtivo ? "text-[#39FF14]" : "text-muted-foreground"}`}
            />
            <p className={cyberAtivo ? "text-white/60" : "text-muted-foreground"}>
              Nenhuma prestação ainda. Crie a primeira!
            </p>
          </CardContent>
        </Card>
      ) : tipoAtivo === "verba_cury" ? (
        <section className="relative z-10">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
                / / VERBAS POR SUPERINTENDENTE
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                Selecione um cartão para escolher a competência
              </p>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {entidadesVerbaCury.length}{" "}
              {entidadesVerbaCury.length === 1 ? "superintendente" : "superintendentes"}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {entidadesVerbaCury.map((grupo) => {
              return (
                <button
                  key={grupo.nome}
                  type="button"
                  disabled={grupo.formularios.length === 0}
                  onClick={() =>
                    setResponsavelSelecionado({ nome: grupo.nome, formularios: grupo.formularios })
                  }
                  className="group border border-[#39FF14]/30 bg-black/55 p-4 text-left backdrop-blur-md transition hover:border-[#39FF14] hover:bg-[#39FF14]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] disabled:cursor-default disabled:opacity-55"
                >
                  <div className="border-b border-white/10 pb-3">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                      Superintendente
                    </div>
                    <h3 className="mt-1 text-sm font-bold uppercase tracking-wider text-[#39FF14]">
                      {grupo.nome}
                    </h3>
                  </div>
                  <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.14em]">
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total de meses</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {grupo.totalMeses}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total de verba</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {brl(grupo.totalVerba)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-2">
                      <span className="text-[#39FF14]/65">Média / mês</span>
                      <span className="font-mono text-sm font-bold text-[#39FF14]">
                        {brl(grupo.mediaMensal)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 text-[8px] uppercase tracking-[0.14em] text-white/30">
                    {grupo.formularios.length > 0
                      ? "Clique para escolher o mês"
                      : "Sem verba cadastrada"}
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
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
                / / GASTOS POR SUPERINTENDENTE
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                Selecione um cartão para escolher o mês
              </p>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {entidadesGastosPessoais.length}{" "}
              {entidadesGastosPessoais.length === 1 ? "superintendente" : "superintendentes"}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {entidadesGastosPessoais.map((grupo) => {
              return (
                <button
                  key={grupo.nome}
                  type="button"
                  disabled={grupo.formularios.length === 0}
                  onClick={() =>
                    setResponsavelSelecionado({ nome: grupo.nome, formularios: grupo.formularios })
                  }
                  className="group border border-[#39FF14]/30 bg-black/55 p-4 text-left backdrop-blur-md transition hover:border-[#39FF14] hover:bg-[#39FF14]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] disabled:cursor-default disabled:opacity-55"
                >
                  <div className="border-b border-white/10 pb-3">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                      Superintendente
                    </div>
                    <h3 className="mt-1 text-sm font-bold uppercase tracking-wider text-[#39FF14]">
                      {grupo.nome}
                    </h3>
                  </div>
                  <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.14em]">
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Gerar Venda</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {brl(grupo.gerarVenda)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Manutenção</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {brl(grupo.manutencao)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {brl(grupo.total)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-2">
                      <span className="text-[#39FF14]/65">Média / mês</span>
                      <span className="font-mono text-sm font-bold text-[#39FF14]">
                        {brl(grupo.mediaMensal)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 text-[8px] uppercase tracking-[0.14em] text-white/30">
                    {grupo.formularios.length > 0
                      ? "Clique para escolher o mês"
                      : "Sem gastos cadastrados"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : tipoAtivo === "planejamento" ? (
        <section className="hidden">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
                / / PLANEJAMENTOS POR RESPONSÁVEL
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                Selecione um cartão para escolher o mês
              </p>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {verbasPorResponsavel.length}{" "}
              {verbasPorResponsavel.length === 1 ? "responsável" : "responsáveis"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {verbasPorResponsavel.map((grupo) => {
              const totais = grupo.formularios.reduce(
                (acc, formulario) => {
                  const plano = planMap[formulario.id];
                  acc.meta += plano?.metaSup || 0;
                  acc.verba += plano?.verbaTotal || 0;
                  acc.corretores += plano?.corretoresAcelera || 0;
                  return acc;
                },
                { meta: 0, verba: 0, corretores: 0 },
              );
              const totalMeses = new Set(
                grupo.formularios.map(
                  (formulario) =>
                    `${formulario.ano_referencia || 0}-${formulario.mes_referencia || 0}`,
                ),
              ).size;
              return (
                <button
                  key={grupo.chave}
                  type="button"
                  onClick={() =>
                    setResponsavelSelecionado({ nome: grupo.nome, formularios: grupo.formularios })
                  }
                  className="group border border-[#39FF14]/30 bg-black/55 p-4 text-left backdrop-blur-md transition hover:border-[#39FF14] hover:bg-[#39FF14]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
                >
                  <div className="border-b border-white/10 pb-3">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                      Responsável
                    </div>
                    <h3 className="mt-1 text-sm font-bold uppercase tracking-wider text-[#39FF14]">
                      {grupo.nome}
                    </h3>
                  </div>
                  <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.14em]">
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total de meses</span>
                      <span className="font-mono text-sm font-bold text-white">{totalMeses}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border border-white/10 p-2">
                      <div>
                        <span className="block text-white/45">Meta planejada</span>
                        <span className="mt-1 block font-mono text-sm font-bold text-white">
                          {totais.meta.toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div>
                        <span className="block text-white/45">Meta realizada</span>
                        <span className="mt-1 block font-mono text-sm font-bold text-white/55">
                          0
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Verba planejada</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {brl(totais.verba)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-2">
                      <span className="text-[#39FF14]/65">Corretores Acelera</span>
                      <span className="font-mono text-sm font-bold text-[#39FF14]">
                        {totais.corretores}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : tipoAtivo === "contratacao" ? (
        <section className="relative z-10">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#39FF14]">
                / / CONTRATAÇÕES POR RESPONSÁVEL
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                Selecione um cartão para escolher o mês
              </p>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
              {verbasPorResponsavel.length}{" "}
              {verbasPorResponsavel.length === 1 ? "responsável" : "responsáveis"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {verbasPorResponsavel.map((grupo) => {
              const totais = grupo.formularios.reduce(
                (acumulado, formulario) => {
                  const contratacao = contratacaoMap[formulario.id] || {
                    candidatos: 0,
                    contratados: 0,
                    total: 0,
                  };
                  acumulado.candidatos += contratacao.candidatos;
                  acumulado.contratados += contratacao.contratados;
                  return acumulado;
                },
                { candidatos: 0, contratados: 0 },
              );
              const totalMeses = new Set(
                grupo.formularios.map(
                  (formulario) =>
                    `${formulario.ano_referencia || 0}-${formulario.mes_referencia || 0}`,
                ),
              ).size;
              const conversao =
                totais.candidatos > 0 ? (totais.contratados / totais.candidatos) * 100 : 0;
              const diretorias = Array.from(
                new Set(grupo.formularios.map((formulario) => formulario.diretor).filter(Boolean)),
              );

              return (
                <button
                  key={grupo.chave}
                  type="button"
                  onClick={() =>
                    setResponsavelSelecionado({ nome: grupo.nome, formularios: grupo.formularios })
                  }
                  className="group border border-[#39FF14]/30 bg-black/55 p-4 text-left backdrop-blur-md transition hover:border-[#39FF14] hover:bg-[#39FF14]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
                >
                  <div className="border-b border-white/10 pb-3">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                      Responsável
                    </div>
                    <h3 className="mt-1 text-sm font-bold uppercase tracking-wider text-[#39FF14]">
                      {grupo.nome}
                    </h3>
                    <div className="mt-1 truncate text-[9px] uppercase tracking-[0.16em] text-white/35">
                      {diretorias.join(" · ") || "Sem diretoria"}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-[10px] uppercase tracking-[0.14em]">
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Candidatos</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {totais.candidatos}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Contratados</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {totais.contratados}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border border-white/10 p-2">
                      <span className="text-white/45">Total de meses</span>
                      <span className="font-mono text-sm font-bold text-white">{totalMeses}</span>
                    </div>
                    <div className="flex items-center justify-between border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-2">
                      <span className="text-[#39FF14]/65">Conversão</span>
                      <span className="font-mono text-sm font-bold text-[#39FF14]">
                        {conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                      </span>
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
            type Col = {
              key: string;
              label: string;
              headerBg: string;
              border: string;
              title: string;
              badge: string;
              items: typeof forms;
            };
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
                cols = [
                  {
                    key: "vazio",
                    label: "Sem lançamentos",
                    headerBg: "bg-muted/20",
                    border: "border-muted",
                    title: "text-muted-foreground",
                    badge: "bg-muted text-foreground",
                    items: [],
                  },
                ];
              }
            } else {
              const source = cyberAtivo ? CYBER_COLUMNS : COLUMNS;
              cols = source.map((c) => ({
                ...c,
                items: baseFiltered.filter((f) => (f.status || "editando") === c.key),
              }));
            }
            return cols.map((col) => {
              const items = col.items;
              const cyber = cyberAtivo;
              return (
                <div
                  key={col.key}
                  className={`relative border ${col.headerBg} ${col.border} p-3 ${cyber ? "backdrop-blur-md" : ""}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className={`text-xs font-bold uppercase tracking-widest ${col.title}`}>
                      {col.label}
                    </h2>
                    <span className={`px-2 py-0.5 text-xs font-medium ${col.badge}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {items.length === 0 && (
                      <div
                        className={`border border-dashed p-4 text-center text-xs ${cyber ? "border-white/10 bg-white/[0.02] text-white/40" : "bg-background/40 text-muted-foreground"}`}
                      >
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
                        {((f.status || "editando") === "editando" || isAdmin) &&
                          (canEdit || isAdmin) && (
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
                              <AlertDialogContent
                                className={
                                  cyber
                                    ? "rounded-none border border-[#39FF14]/40 bg-black/90 backdrop-blur-md text-gray-300"
                                    : undefined
                                }
                              >
                                <AlertDialogHeader>
                                  <AlertDialogTitle
                                    className={
                                      cyber
                                        ? "text-[#39FF14] uppercase tracking-[0.25em] text-sm"
                                        : undefined
                                    }
                                  >
                                    {cyber
                                      ? tipoAtivo === "planejamento"
                                        ? "// EXCLUIR PLANEJAMENTO?"
                                        : tipoAtivo === "gastos_pessoais"
                                          ? "// EXCLUIR GASTOS PESSOAIS?"
                                          : "// EXCLUIR VERBA CURY?"
                                      : "Excluir prestação?"}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription
                                    className={
                                      cyber
                                        ? "text-gray-400 uppercase tracking-widest text-[10px]"
                                        : undefined
                                    }
                                  >
                                    Esta ação não pode ser desfeita. Todos os lançamentos vinculados
                                    também serão removidos.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel
                                    className={
                                      cyber
                                        ? "rounded-none border border-[#39FF14]/30 bg-transparent text-gray-400 hover:bg-[#39FF14]/10 hover:text-[#39FF14] uppercase tracking-widest text-[10px]"
                                        : undefined
                                    }
                                  >
                                    Cancelar
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className={
                                      cyber
                                        ? "rounded-none bg-transparent border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14] hover:text-black font-bold uppercase tracking-widest text-[10px]"
                                        : undefined
                                    }
                                    onClick={async () => {
                                      const { data: lancs } = await supabase
                                        .from("lancamentos")
                                        .select("*")
                                        .eq("formulario_id", f.id);
                                      const { data: forms } = await supabase
                                        .from("formularios")
                                        .select("*")
                                        .eq("id", f.id);
                                      await supabase
                                        .from("lancamentos")
                                        .delete()
                                        .eq("formulario_id", f.id);
                                      const { error } = await supabase
                                        .from("formularios")
                                        .delete()
                                        .eq("id", f.id);
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
                              <CardTitle
                                className={`text-sm ${cyber ? "text-white font-bold uppercase tracking-tight" : ""}`}
                              >
                                {f.tipo === "gastos_pessoais" || f.tipo === "contratacao"
                                  ? f.responsavel ||
                                    usuarios.find((u) => u.id === (f as any).usuario_id)?.nome ||
                                    f.nome ||
                                    fmtDateTime(f.created_at)
                                  : f.nome || fmtDateTime(f.created_at)}
                              </CardTitle>
                            </div>
                            <p
                              className={`text-[10px] uppercase tracking-[0.2em] ${f.tipo === "gastos_pessoais" ? "text-[#39FF14] font-bold" : cyber ? "text-[#39FF14]/80" : "text-muted-foreground/80"}`}
                            >
                              {tipoLabel(f.tipo)}
                            </p>
                            {f.tipo === "verba_cury" && (
                              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">
                                {f.tipo_verba === "campanha_estoque"
                                  ? "Campanha de Estoque"
                                  : "Cury"}
                              </p>
                            )}
                            {f.mes_referencia && f.ano_referencia && (
                              <p
                                className={`text-xs ${cyber ? "text-white/40" : "text-muted-foreground"}`}
                              >
                                Ref: {MESES[f.mes_referencia - 1]}/{f.ano_referencia}
                              </p>
                            )}
                          </CardHeader>
                          <CardContent
                            className={`space-y-1 p-4 pt-0 text-xs ${cyber ? "text-white/80" : ""}`}
                          >
                            {f.tipo !== "gastos_pessoais" && f.diretor && (
                              <div className="flex justify-between">
                                <span className={cyber ? "text-white/40" : "text-muted-foreground"}>
                                  Diretor
                                </span>
                                <span className="truncate pl-2">{f.diretor}</span>
                              </div>
                            )}
                            {f.tipo !== "gastos_pessoais" && f.superintendente && (
                              <div className="flex justify-between">
                                <span className={cyber ? "text-white/40" : "text-muted-foreground"}>
                                  Superint.
                                </span>
                                <span className="truncate pl-2">{f.superintendente}</span>
                              </div>
                            )}
                            {f.tipo !== "gastos_pessoais" && f.responsavel && (
                              <div className="flex justify-between">
                                <span className={cyber ? "text-white/40" : "text-muted-foreground"}>
                                  Responsável
                                </span>
                                <span className="truncate pl-2">{f.responsavel}</span>
                              </div>
                            )}
                            {f.tipo === "gastos_pessoais" &&
                              (() => {
                                const g = gastosMap[f.id] || { gv: 0, mn: 0, total: 0 };
                                return (
                                  <>
                                    <div
                                      className={`mt-2 flex justify-between border-t pt-2 ${cyber ? "border-white/10" : ""}`}
                                    >
                                      <span className="text-white/40">Gerar Venda</span>
                                      <span className="text-[#39FF14]">{brl(g.gv)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-white/40">Manutenção</span>
                                      <span className="text-blue-700">{brl(g.mn)}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold">
                                      <span>Total</span>
                                      <span>{brl(g.total)}</span>
                                    </div>
                                  </>
                                );
                              })()}
                            {f.tipo === "verba_cury" &&
                              (() => {
                                const total = Number(f.valor_agilitas) + Number(f.valor_marketing);
                                const saldoF = disponivelMap[f.id] ?? total;
                                const utilizado = total - saldoF;
                                return (
                                  <>
                                    <div
                                      className={`mt-2 flex justify-between border-t pt-2 ${cyber ? "border-white/10" : ""}`}
                                    >
                                      <span
                                        className={
                                          cyber ? "text-white/40" : "text-muted-foreground"
                                        }
                                      >
                                        Verba Agilitas
                                      </span>
                                      <span>{brl(Number(f.valor_agilitas) || 0)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span
                                        className={
                                          cyber ? "text-white/40" : "text-muted-foreground"
                                        }
                                      >
                                        Verba Marketing
                                      </span>
                                      <span>{brl(Number(f.valor_marketing) || 0)}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold">
                                      <span>Total</span>
                                      <span>{brl(total)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span
                                        className={
                                          cyber ? "text-white/40" : "text-muted-foreground"
                                        }
                                      >
                                        Utilizado
                                      </span>
                                      <span
                                        className={cyber ? "text-orange-400" : "text-orange-600"}
                                      >
                                        {brl(utilizado)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between font-semibold">
                                      <span>Saldo</span>
                                      <span
                                        className={
                                          saldoF < 0
                                            ? "text-destructive"
                                            : cyber
                                              ? "text-[#39FF14]"
                                              : "text-emerald-600"
                                        }
                                      >
                                        {brl(saldoF)}
                                      </span>
                                    </div>
                                  </>
                                );
                              })()}
                            {f.tipo === "planejamento" &&
                              (() => {
                                const p = planMap[f.id];
                                const ownerNome =
                                  usuarios.find((u) => u.id === (f as any).usuario_id)?.nome || "—";
                                return (
                                  <>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Superint.</span>
                                      <span className="truncate pl-2">{ownerNome}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Meta Sup.</span>
                                      <span className="pl-2">
                                        {(p?.metaSup || 0).toLocaleString("pt-BR")}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Verba Total</span>
                                      <span className="pl-2">{brl(p?.verbaTotal || 0)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        Corretores Acelera
                                      </span>
                                      <span className="pl-2">{p?.corretoresAcelera || 0}</span>
                                    </div>
                                  </>
                                );
                              })()}
                            {f.tipo === "contratacao" &&
                              (() => {
                                const c = contratacaoMap[f.id] || {
                                  candidatos: 0,
                                  contratados: 0,
                                  total: 0,
                                };
                                return (
                                  <div
                                    className={`mt-2 flex justify-between border-t pt-2 ${cyber ? "border-[#39FF14]/30" : ""}`}
                                  >
                                    <span
                                      className={cyber ? "text-white/40" : "text-muted-foreground"}
                                    >
                                      Total
                                    </span>
                                    <span
                                      className={
                                        cyber ? "text-[#39FF14] font-bold" : "font-semibold"
                                      }
                                    >
                                      {c.total}
                                    </span>
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

      <Dialog
        open={Boolean(responsavelSelecionado)}
        onOpenChange={(aberto) => !aberto && setResponsavelSelecionado(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-none border border-[#39FF14]/40 bg-black/95 text-white backdrop-blur-xl sm:max-w-xl">
          <DialogHeader className="border-b border-[#39FF14]/20 pb-4">
            <DialogTitle className="text-sm font-bold uppercase tracking-[0.22em] text-[#39FF14]">
              / / ESCOLHA O MÊS
            </DialogTitle>
            <p className="text-xs uppercase tracking-[0.14em] text-white/50">
              {responsavelSelecionado?.nome}
            </p>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {responsavelSelecionado?.formularios
              .slice()
              .sort(
                (a, b) =>
                  (b.ano_referencia || 0) * 100 +
                  (b.mes_referencia || 0) -
                  ((a.ano_referencia || 0) * 100 + (a.mes_referencia || 0)),
              )
              .map((formulario) => {
                const status = formulario.status || "editando";
                const contratacao = contratacaoMap[formulario.id] || {
                  candidatos: 0,
                  contratados: 0,
                  total: 0,
                };
                const planejamento = planMap[formulario.id];
                const valor =
                  tipoAtivo === "gastos_pessoais"
                    ? gastosDoFormulario(formulario.id).total
                    : tipoAtivo === "planejamento"
                      ? planejamento?.verbaTotal || 0
                      : (Number(formulario.valor_agilitas) || 0) +
                        (Number(formulario.valor_marketing) || 0);
                return (
                  <div
                    key={formulario.id}
                    className="flex border border-white/10 bg-white/[0.025] transition hover:border-[#39FF14]/70"
                  >
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
                          {formulario.mes_referencia
                            ? MESES[formulario.mes_referencia - 1]
                            : "Sem mês"}
                          /{formulario.ano_referencia || "—"}
                        </div>
                        {tipoAtivo === "verba_cury" && (
                          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
                            {formulario.tipo_verba === "campanha_estoque"
                              ? "Campanha de Estoque"
                              : "Cury"}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {tipoAtivo === "contratacao" ? (
                          <div className="font-mono text-[10px] font-bold uppercase text-[#39FF14]">
                            {contratacao.candidatos} candidatos · {contratacao.contratados}{" "}
                            contratados
                          </div>
                        ) : tipoAtivo === "planejamento" ? (
                          <div className="font-mono text-[10px] font-bold uppercase text-[#39FF14]">
                            Meta {Number(planejamento?.metaSup || 0).toLocaleString("pt-BR")} ·{" "}
                            {brl(valor)}
                          </div>
                        ) : (
                          <div className="font-mono text-xs font-bold text-[#39FF14]">
                            {brl(valor)}
                          </div>
                        )}
                        <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-white/45">
                          {status === "editando" ? "Em aberto" : status}
                        </div>
                      </div>
                    </button>
                    {isAdmin &&
                      (tipoAtivo === "verba_cury" ||
                        tipoAtivo === "contratacao" ||
                        tipoAtivo === "planejamento" ||
                        tipoAtivo === "gastos_pessoais") && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Excluir ${tipoAtivo === "contratacao" ? "formulário de contratação" : tipoAtivo === "planejamento" ? "planejamento" : tipoAtivo === "gastos_pessoais" ? "gastos pessoais" : "verba"} de ${formulario.mes_referencia ? MESES[formulario.mes_referencia - 1] : "mês não informado"}`}
                              className="flex w-12 shrink-0 items-center justify-center border-l border-red-500/25 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-none border border-red-500/40 bg-black/95 text-white backdrop-blur-xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-sm uppercase tracking-[0.2em] text-red-400">
                                / /{" "}
                                {tipoAtivo === "contratacao"
                                  ? "EXCLUIR CONTRATAÇÃO?"
                                  : tipoAtivo === "planejamento"
                                    ? "EXCLUIR PLANEJAMENTO?"
                                    : tipoAtivo === "gastos_pessoais"
                                      ? "EXCLUIR GASTOS PESSOAIS?"
                                      : "EXCLUIR VERBA CURY?"}
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-xs text-white/50">
                                {tipoAtivo === "contratacao"
                                  ? "O formulário de contratação"
                                  : tipoAtivo === "planejamento"
                                    ? "O planejamento"
                                    : tipoAtivo === "gastos_pessoais"
                                      ? "Os gastos pessoais"
                                      : "A verba"}{" "}
                                de{" "}
                                {formulario.mes_referencia
                                  ? MESES[formulario.mes_referencia - 1]
                                  : "mês não informado"}
                                /{formulario.ano_referencia || "—"} e todos os lançamentos
                                vinculados serão removidos. Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-none border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-none border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-black"
                                onClick={async () => {
                                  const { data: lancamentosExcluidos } = await supabase
                                    .from("lancamentos")
                                    .select("*")
                                    .eq("formulario_id", formulario.id);
                                  const { data: formulariosExcluidos } = await supabase
                                    .from("formularios")
                                    .select("*")
                                    .eq("id", formulario.id);
                                  const { error: erroLancamentos } = await supabase
                                    .from("lancamentos")
                                    .delete()
                                    .eq("formulario_id", formulario.id);
                                  if (erroLancamentos) return toast.error(erroLancamentos.message);
                                  const { error: erroFormulario } = await supabase
                                    .from("formularios")
                                    .delete()
                                    .eq("id", formulario.id);
                                  if (erroFormulario) return toast.error(erroFormulario.message);

                                  pushUndo(
                                    `${tipoAtivo === "contratacao" ? "Contratação" : tipoAtivo === "planejamento" ? "Planejamento" : tipoAtivo === "gastos_pessoais" ? "Gastos pessoais" : "Verba"} de ${formulario.mes_referencia ? MESES[formulario.mes_referencia - 1] : "mês não informado"}/${formulario.ano_referencia || "—"} excluído`,
                                    [
                                      { table: "formularios", rows: formulariosExcluidos || [] },
                                      { table: "lancamentos", rows: lancamentosExcluidos || [] },
                                    ],
                                  );
                                  setResponsavelSelecionado(null);
                                  toast.success(
                                    tipoAtivo === "contratacao"
                                      ? "Formulário de contratação excluído com sucesso."
                                      : tipoAtivo === "planejamento"
                                        ? "Planejamento excluído com sucesso."
                                        : tipoAtivo === "gastos_pessoais"
                                          ? "Gastos pessoais excluídos com sucesso."
                                          : "Verba Cury excluída com sucesso.",
                                  );
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

const COLUMNS: {
  key: string;
  label: string;
  headerBg: string;
  border: string;
  title: string;
  badge: string;
}[] = [
  // Em aberto → accent (#004AAD)
  {
    key: "editando",
    label: "Em aberto",
    headerBg: "bg-[#004AAD]/5",
    border: "border-[#004AAD]/30",
    title: "text-[#004AAD]",
    badge: "bg-[#004AAD] text-white",
  },
  // Finalizado → primary (#D11877)
  {
    key: "finalizado",
    label: "Finalizado",
    headerBg: "bg-[#D11877]/5",
    border: "border-[#D11877]/30",
    title: "text-[#D11877]",
    badge: "bg-[#D11877] text-white",
  },
  // Validado → secondary (#0D7A38)
  {
    key: "validado",
    label: "Validado",
    headerBg: "bg-[#0D7A38]/5",
    border: "border-[#0D7A38]/30",
    title: "text-[#0D7A38]",
    badge: "bg-[#0D7A38] text-white",
  },
  // Reprovado → vermelho
  {
    key: "reprovado",
    label: "Reprovado",
    headerBg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-300",
    title: "text-red-700",
    badge: "bg-red-600 text-white",
  },
];

const CYBER_COLUMNS: typeof COLUMNS = [
  {
    key: "editando",
    label: "Em aberto",
    headerBg: "bg-black/40",
    border: "border-[#39FF14]/40",
    title: "text-[#ff1493]",
    badge: "bg-white/10 text-white border border-white/20",
  },
  {
    key: "finalizado",
    label: "Finalizado",
    headerBg: "bg-black/40",
    border: "border-[#39FF14]/40",
    title: "text-[#ff1493]",
    badge: "bg-white/10 text-white border border-white/20",
  },
  {
    key: "validado",
    label: "Validado",
    headerBg: "bg-black/40",
    border: "border-[#39FF14]/40",
    title: "text-[#ff1493]",
    badge: "bg-white/10 text-white border border-white/20",
  },
  {
    key: "reprovado",
    label: "Reprovado",
    headerBg: "bg-black/40",
    border: "border-[#39FF14]/40",
    title: "text-[#ff1493]",
    badge: "bg-white/10 text-white border border-white/20",
  },
];
