import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResumoInicioButton } from "@/components/ResumoInicioButton";
import { CyberProgressRing } from "@/components/CyberProgressRing";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pastasSheetsList, type PastaVolumeRow } from "@/functions/google-sheets-pastas.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { brl } from "@/lib/format";
import { vendasList } from "@/functions/vendas.functions";

export const Route = createFileRoute("/_app/inicio")({ component: PaginaInicial });

type Formulario = {
  id: string;
  tipo: string;
  status: string;
  nome: string | null;
  superintendente: string | null;
  mes_referencia: number | null;
  ano_referencia: number | null;
  created_at: string;
  valor_agilitas?: number | null;
  valor_marketing?: number | null;
};
type Financeiro = { valor: number; tipo_gasto: string; mes: number; ano: number };
type Previsao = {
  preciso_vendas: number;
  semana_inicio: string | null;
  superintendente: string | null;
};
type LancamentoHome = {
  formulario_id: string;
  secao: string | null;
  superintendente: string | null;
  meta_sup: number | null;
  contratados: number | null;
  reprovado: boolean | null;
};
type VendaHome = {
  superintendente: string | null;
  data_assinatura: string | null;
  unidades: number;
};
const MESES_HOME = [
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

const isoLocal = (data: Date) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

const normalizarNome = (valor: string | null | undefined) =>
  (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

const modulos = [
  {
    nome: "Verba Cury",
    descricao: "Orçamento e validação",
    to: "/dashboard",
    search: { tipo: "verba_cury" },
    tipo: "verba_cury",
  },
  {
    nome: "Gastos Pessoais",
    descricao: "Investimentos da operação",
    to: "/dashboard",
    search: { tipo: "gastos_pessoais" },
    tipo: "gastos_pessoais",
  },
  {
    nome: "Contratação",
    descricao: "Movimento de pessoas",
    to: "/dashboard",
    search: { tipo: "contratacao" },
    tipo: "contratacao",
  },
  {
    nome: "Planejamento",
    descricao: "Metas, verba e plantões",
    to: "/dashboard",
    search: { tipo: "planejamento" },
    tipo: "planejamento",
  },
  {
    nome: "Acelera Vendas",
    descricao: "Participantes e pagamentos",
    to: "/acelera",
    tipo: "planejamento",
  },
  { nome: "Pastas", descricao: "Volume de PV e análises bancárias", to: "/pastas", tipo: "pastas" },
] as const;

function PaginaInicial() {
  const { nome, role, isAdmin, isDiretor, session } = useAuth();
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [financeiro, setFinanceiro] = useState<Financeiro[]>([]);
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoHome[]>([]);
  const [vendas, setVendas] = useState<VendaHome[]>([]);
  const [pastas, setPastas] = useState<PastaVolumeRow[]>([]);
  const [pastasLoading, setPastasLoading] = useState(true);
  const [agora, setAgora] = useState(new Date());
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtroMes, setFiltroMes] = useState(() => isoLocal(new Date()).slice(0, 7));
  const [filtroSemana, setFiltroSemana] = useState(() => isoLocal(new Date()));
  const [filtroSup, setFiltroSup] = useState("todos");
  const filtrosRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!filtrosAbertos) return;
    const fecharAoClicarFora = (event: MouseEvent) => {
      const alvo = event.target as HTMLElement;
      if (alvo.closest('[role="listbox"]') || alvo.closest("[data-radix-popper-content-wrapper]")) {
        return;
      }
      if (filtrosRef.current && !filtrosRef.current.contains(alvo)) setFiltrosAbertos(false);
    };
    document.addEventListener("mousedown", fecharAoClicarFora);
    return () => document.removeEventListener("mousedown", fecharAoClicarFora);
  }, [filtrosAbertos]);

  useEffect(() => {
    (async () => {
      const [forms, fin, prev, vendasResposta] = await Promise.all([
        supabase
          .from("formularios")
          .select(
            "id,tipo,status,nome,superintendente,mes_referencia,ano_referencia,created_at,valor_agilitas,valor_marketing",
          )
          .order("created_at", { ascending: false })
          .limit(300),
        // A tabela existe no banco, mas ainda não consta nos tipos legados deste módulo.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("lancamentos_financeiros")
          .select("valor,tipo_gasto,mes,ano")
          .limit(1000),
        supabase
          .from("previsoes")
          .select("preciso_vendas,semana_inicio,superintendente")
          .limit(1000),
        session?.access_token
          ? vendasList({ data: { token: session.access_token } }).catch(() => ({ vendas: [] }))
          : Promise.resolve({ vendas: [] }),
      ]);
      const listaForms = (forms.data || []) as Formulario[];
      setFormularios(listaForms);
      setFinanceiro((fin.data || []) as Financeiro[]);
      setPrevisoes((prev.data || []) as Previsao[]);
      setVendas(((vendasResposta as { vendas?: VendaHome[] })?.vendas || []) as VendaHome[]);
      if (listaForms.length) {
        const idsFormularios = listaForms.map((formulario) => formulario.id);
        const linhasCompletas: LancamentoHome[] = [];
        const tamanhoPagina = 1000;
        const tamanhoLoteFormularios = 100;

        for (
          let inicioLote = 0;
          inicioLote < idsFormularios.length;
          inicioLote += tamanhoLoteFormularios
        ) {
          const idsDoLote = idsFormularios.slice(
            inicioLote,
            inicioLote + tamanhoLoteFormularios,
          );
          for (let inicioPagina = 0; ; inicioPagina += tamanhoPagina) {
            const { data: pagina, error: erroLinhas } = await supabase
              .from("lancamentos")
              .select("id,formulario_id,secao,superintendente,meta_sup,contratados,reprovado")
              .in("formulario_id", idsDoLote)
              .order("id", { ascending: true })
              .range(inicioPagina, inicioPagina + tamanhoPagina - 1);
            if (erroLinhas) throw erroLinhas;
            linhasCompletas.push(...((pagina || []) as LancamentoHome[]));
            if (!pagina || pagina.length < tamanhoPagina) break;
          }
        }

        setLancamentos(linhasCompletas);
      } else {
        setLancamentos([]);
      }
    })();
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || (!isAdmin && !isDiretor)) {
      setPastasLoading(false);
      return;
    }
    setPastasLoading(true);
    void pastasSheetsList({ data: { token: session.access_token } })
      .then((result) => {
        setPastas(result.rows);
      })
      .catch(() => {
        setPastas([]);
      })
      .finally(() => setPastasLoading(false));
  }, [session?.access_token, isAdmin, isDiretor]);

  const superintendentesFiltro = useMemo(() => {
    const nomes = [
      ...formularios.map((item) => item.superintendente),
      ...lancamentos.map((item) => item.superintendente),
      ...previsoes.map((item) => item.superintendente),
      ...vendas.map((item) => item.superintendente),
      ...pastas.map((item) => item.superintendente),
    ].filter((item): item is string => Boolean(item?.trim()));
    return Array.from(
      nomes
        .reduce((mapa, item) => {
          const chave = normalizarNome(item);
          if (!mapa.has(chave)) mapa.set(chave, item.trim());
          return mapa;
        }, new Map<string, string>())
        .values(),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [formularios, lancamentos, previsoes, vendas, pastas]);

  const pertenceAoSup = (valor: string | null | undefined) =>
    filtroSup === "todos" || normalizarNome(valor) === normalizarNome(filtroSup);
  const [anoFiltrado, mesFiltrado] = filtroMes.split("-").map(Number);
  const mesAtual = Number.isFinite(mesFiltrado) ? mesFiltrado : agora.getMonth() + 1;
  const anoAtual = Number.isFinite(anoFiltrado) ? anoFiltrado : agora.getFullYear();
  const referenciaSemana = /^\d{4}-\d{2}-\d{2}$/.test(filtroSemana)
    ? new Date(`${filtroSemana}T12:00:00`)
    : agora;
  const inicioSemana = new Date(referenciaSemana);
  inicioSemana.setHours(0, 0, 0, 0);
  inicioSemana.setDate(inicioSemana.getDate() - ((inicioSemana.getDay() + 6) % 7));
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(fimSemana.getDate() + 6);
  const inicioSemanaISO = isoLocal(inicioSemana);
  const fimSemanaISO = isoLocal(fimSemana);
  const formulariosMesBase = formularios.filter(
    (formulario) =>
      formulario.mes_referencia === mesAtual && formulario.ano_referencia === anoAtual,
  );
  const formulariosMes = formulariosMesBase.filter((formulario) =>
    pertenceAoSup(formulario.superintendente || formulario.nome),
  );
  const emAberto = formulariosMes.filter((item) =>
    ["editando", "finalizado"].includes(item.status),
  );
  const aguardandoValidacao = formulariosMes.filter((item) => item.status === "finalizado");
  const validados = formulariosMes.filter((item) => item.status === "validado");
  const investimentoMes = financeiro
    .filter((item) => item.mes === mesAtual && item.ano === anoAtual)
    .reduce((total, item) => total + Number(item.valor || 0), 0);
  const previsaoAtual = previsoes
    .filter((item) => item.semana_inicio === inicioSemanaISO && pertenceAoSup(item.superintendente))
    .reduce((total, item) => total + Number(item.preciso_vendas || 0), 0);
  const vendasSemana = vendas.filter(
    (venda) =>
      pertenceAoSup(venda.superintendente) &&
      !!venda.data_assinatura &&
      venda.data_assinatura >= inicioSemanaISO &&
      venda.data_assinatura <= fimSemanaISO,
  );
  const realizadoAtual = vendasSemana.reduce(
    (total, venda) => total + Number(venda.unidades || 0),
    0,
  );
  const percentualPrevisao = previsaoAtual > 0 ? (realizadoAtual / previsaoAtual) * 100 : 0;
  const saldoPrevisao = realizadoAtual - previsaoAtual;
  const planejamentosValidos = formulariosMesBase.filter(
    (formulario) => formulario.tipo === "planejamento" && formulario.status === "validado",
  );
  const idsPlanejamento = new Set(planejamentosValidos.map((formulario) => formulario.id));
  const metasPorSup = Array.from(
    lancamentos
      .filter(
        (linha) =>
          idsPlanejamento.has(linha.formulario_id) &&
          !linha.reprovado &&
          (linha.secao || "principal") === "principal" &&
          pertenceAoSup(
            linha.superintendente ||
              planejamentosValidos.find((formulario) => formulario.id === linha.formulario_id)
                ?.superintendente,
          ),
      )
      .reduce((mapa, linha) => {
        const sup =
          linha.superintendente ||
          planejamentosValidos.find((formulario) => formulario.id === linha.formulario_id)
            ?.superintendente ||
          "Sem responsável";
        mapa.set(sup, (mapa.get(sup) || 0) + Number(linha.meta_sup || 0));
        return mapa;
      }, new Map<string, number>())
      .entries(),
  )
    .map(([sup, planejado]) => ({
      sup,
      planejado,
      realizado: vendasSemana
        .filter((venda) => normalizarNome(venda.superintendente) === normalizarNome(sup))
        .reduce((total, venda) => total + Number(venda.unidades || 0), 0),
    }))
    .sort((a, b) => a.sup.localeCompare(b.sup, "pt-BR"));
  const metaPlanejada = metasPorSup.reduce((total, item) => total + item.planejado, 0);
  const metaRealizada = metasPorSup.reduce((total, item) => total + item.realizado, 0);
  const percentualPlanejamento =
    metaPlanejada > 0 ? Math.min((metaRealizada / metaPlanejada) * 100, 999) : 0;
  const verbasValidas = formulariosMes.filter(
    (formulario) => formulario.tipo === "verba_cury" && formulario.status === "validado",
  );
  const totalVerba = verbasValidas.reduce(
    (total, formulario) =>
      total + Number(formulario.valor_agilitas || 0) + Number(formulario.valor_marketing || 0),
    0,
  );
  const idsContratacao = new Set(
    formulariosMes
      .filter((formulario) => formulario.tipo === "contratacao" && formulario.status === "validado")
      .map((formulario) => formulario.id),
  );
  const totalContratacoes = lancamentos
    .filter((linha) => idsContratacao.has(linha.formulario_id) && !linha.reprovado)
    .reduce((total, linha) => total + Number(linha.contratados || 0), 0);
  const pastasPeriodo = pastas.filter(
    (pasta) =>
      pertenceAoSup(pasta.superintendente) && pasta.data_criacao?.slice(0, 7) === filtroMes,
  );
  const pastasAbPeriodo = pastasPeriodo.reduce(
    (total, pasta) => total + Number(pasta.ab_quantidade || 0),
    0,
  );
  const atividade = formulariosMes.slice(0, 6);
  const statusSistema =
    aguardandoValidacao.length > 0
      ? "ATENÇÃO NECESSÁRIA"
      : emAberto.length > 0
        ? "OPERAÇÃO EM CURSO"
        : "SISTEMA ESTÁVEL";

  const contagemPorTipo = useMemo(
    () =>
      formulariosMes.reduce<Record<string, { total: number; pendentes: number }>>((mapa, item) => {
        const atual = mapa[item.tipo] || { total: 0, pendentes: 0 };
        atual.total += 1;
        if (item.status !== "validado") atual.pendentes += 1;
        mapa[item.tipo] = atual;
        return mapa;
      }, {}),
    [formulariosMes],
  );

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="text-xl font-light uppercase tracking-[0.18em] text-[#39FF14]">
          Olá, {nome?.split(" ")[0] || "usuário"}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ResumoInicioButton token={session?.access_token ?? ""} />
          <div ref={filtrosRef} className="relative">
            <button
              type="button"
              aria-expanded={filtrosAbertos}
              aria-controls="inicio-filtros"
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
              Filtro
            </button>
            <div
              id="inicio-filtros"
              className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,340px)] origin-top-right border border-[#39FF14]/35 bg-black/95 p-4 shadow-[0_0_35px_rgba(57,255,20,0.14)] backdrop-blur-2xl transition-all duration-200 ${filtrosAbertos ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"}`}
            >
              <div className="mb-4 border-b border-[#39FF14]/20 pb-2 text-[9px] uppercase tracking-[0.3em] text-white/40">
                / / Filtrar visão
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[8px] uppercase tracking-[0.18em] text-white/35">
                    Competência mensal
                  </span>
                  <Input
                    type="month"
                    value={filtroMes}
                    onChange={(event) => setFiltroMes(event.target.value)}
                    className="border-[#39FF14]/25 text-[10px] uppercase tracking-[0.12em] [color-scheme:dark]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[8px] uppercase tracking-[0.18em] text-white/35">
                    Semana de referência
                  </span>
                  <Input
                    type="date"
                    value={filtroSemana}
                    onChange={(event) => setFiltroSemana(event.target.value)}
                    className="border-[#39FF14]/25 text-[10px] uppercase tracking-[0.12em] [color-scheme:dark]"
                  />
                  <span className="mt-1 block text-[7px] uppercase tracking-[0.1em] text-white/20">
                    Selecione qualquer dia da semana
                  </span>
                </label>
                <div>
                  <span className="mb-1.5 block text-[8px] uppercase tracking-[0.18em] text-white/35">
                    Superintendente
                  </span>
                  <Select value={filtroSup} onValueChange={setFiltroSup}>
                    <SelectTrigger className="border-[#39FF14]/25 text-[9px] uppercase tracking-[0.14em]">
                      <SelectValue placeholder="TODOS OS SUPERINTENDENTES" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">TODOS OS SUPERINTENDENTES</SelectItem>
                      {superintendentesFiltro.map((superintendente) => (
                        <SelectItem key={superintendente} value={superintendente}>
                          {superintendente.toLocaleUpperCase("pt-BR")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const hoje = new Date();
                    setFiltroMes(isoLocal(hoje).slice(0, 7));
                    setFiltroSemana(isoLocal(hoje));
                    setFiltroSup("todos");
                  }}
                  className="h-9 w-full border border-[#39FF14]/30 text-[8px] font-bold uppercase tracking-[0.2em] text-[#39FF14] transition hover:border-[#39FF14] hover:bg-[#39FF14]/10"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-[1.18fr_.82fr]">
            <Link
              to="/dashboard"
              search={{ tipo: "planejamento" }}
              className="group relative min-h-[390px] overflow-hidden border border-[#39FF14]/25 bg-black/70 p-5 transition hover:border-[#39FF14]/60"
            >
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#39FF14]/[0.07] blur-3xl" />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.22em] text-[#39FF14]">
                      / / Planejamento
                    </div>
                    <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/30">
                      {MESES_HOME[mesAtual - 1]} · semana{" "}
                      {inicioSemana.toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                      —{fimSemana.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </div>
                  </div>
                  <span className="text-[8px] uppercase tracking-[0.12em] text-[#39FF14]/60">
                    Abrir planejamento →
                  </span>
                </div>
                <div className="mt-7 grid items-center gap-6 sm:grid-cols-[170px_1fr]">
                  <CyberProgressRing
                    percentual={percentualPlanejamento}
                    valor={`${percentualPlanejamento.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
                    rotulo="Realizado"
                  />
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">
                      Planejado
                    </div>
                    <div className="mt-2 flex items-end gap-3">
                      <strong className="font-mono text-4xl font-light text-white">
                        {metaPlanejada.toLocaleString("pt-BR")}
                      </strong>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden bg-white/10">
                      <div
                        className="h-full bg-[#39FF14] shadow-[0_0_10px_#39FF14] transition-all"
                        style={{ width: `${Math.min(percentualPlanejamento, 100)}%` }}
                      />
                    </div>
                    <div className="mt-3 flex justify-between text-[9px] uppercase tracking-[0.13em]">
                      <span className="text-white/35">Realizado até agora</span>
                      <strong className="font-mono text-[#39FF14]">
                        {metaRealizada.toLocaleString("pt-BR")}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="mt-auto grid gap-px border-t border-white/10 bg-white/10 pt-px sm:grid-cols-2 xl:grid-cols-3">
                  {metasPorSup.map((item) => (
                    <div key={item.sup} className="bg-black/80 px-3 py-2">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.13em] text-white/65">
                        {item.sup}
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                        <span className="text-white/35">
                          {item.planejado.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-[#39FF14]">
                          {item.realizado.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  ))}
                  {metasPorSup.length === 0 && (
                    <div className="bg-black/80 p-4 text-[9px] uppercase tracking-widest text-white/25 sm:col-span-2 xl:col-span-3">
                      Nenhum planejamento validado no período
                    </div>
                  )}
                </div>
              </div>
            </Link>

            <div className="grid min-h-[390px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Link
                to="/dashboard"
                search={{ tipo: "verba_cury" }}
                className="group border border-white/10 bg-[linear-gradient(135deg,rgba(57,255,20,.045),rgba(0,0,0,.8))] p-4 transition hover:border-[#39FF14]/55"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#39FF14]">
                    / / Verba Cury
                  </span>
                  <span className="text-[7px] uppercase tracking-[0.12em] text-[#39FF14]/55">
                    Abrir →
                  </span>
                </div>
                <div className="mt-5 text-[8px] uppercase tracking-[0.14em] text-white/30">
                  Total investido
                </div>
                <div className="mt-1 font-mono text-3xl font-light text-[#39FF14]">
                  {brl(totalVerba)}
                </div>
              </Link>
              <Link
                to="/dashboard"
                search={{ tipo: "contratacao" }}
                className="group border border-white/10 bg-black/65 p-4 transition hover:border-[#39FF14]/55"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#39FF14]">
                    / / Contratações
                  </span>
                  <span className="text-[7px] uppercase tracking-[0.12em] text-[#39FF14]/55">
                    Abrir →
                  </span>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="font-mono text-3xl font-light text-white">
                      {totalContratacoes}
                    </div>
                    <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/30">
                      Contratados no mês
                    </div>
                  </div>
                  <div className="h-9 w-20 border-b border-[#39FF14]/35 bg-[linear-gradient(135deg,transparent_45%,rgba(57,255,20,.18)_46%,rgba(57,255,20,.03))]" />
                </div>
              </Link>
              <Link
                to="/pastas"
                className="group border border-[#39FF14]/20 bg-black/65 p-4 transition hover:border-[#39FF14]/60 sm:col-span-2 lg:col-span-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#39FF14]">
                    / / Pastas
                  </span>
                  <span className="text-[7px] uppercase tracking-[0.12em] text-[#39FF14]/55">
                    Abrir →
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                  <div>
                    <div className="font-mono text-2xl text-white">
                      {pastasLoading ? "—" : pastasPeriodo.length.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-[7px] uppercase tracking-[0.1em] text-white/30">
                      Total de PV
                    </div>
                  </div>
                  <div className="pb-2 text-[#39FF14]/40">/</div>
                  <div className="text-right">
                    <div className="font-mono text-2xl text-[#39FF14]">
                      {pastasLoading ? "—" : pastasAbPeriodo.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-[7px] uppercase tracking-[0.1em] text-white/30">
                      Análises bancárias
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </section>
        </div>

        <aside className="border border-white/10 bg-black/65 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#39FF14]">
                / / FLUXOS PARA VALIDAR
              </h2>
              <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/25">
                Aguardando decisão
              </div>
            </div>
            <span className="font-mono text-2xl font-light text-amber-300">
              {aguardandoValidacao.length}
            </span>
          </div>
          <div className="mt-2 divide-y divide-white/[0.07]">
            {aguardandoValidacao.map((item) => (
              <Link
                key={item.id}
                to="/formularios/$id"
                params={{ id: item.id }}
                className="block py-3 transition hover:bg-white/[0.025]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">
                      {item.superintendente || item.nome || item.tipo.replaceAll("_", " ")}
                    </div>
                    <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/30">
                      {item.tipo.replaceAll("_", " ")} ·{" "}
                      {item.mes_referencia
                        ? `${String(item.mes_referencia).padStart(2, "0")}/${item.ano_referencia}`
                        : "Sem competência"}
                    </div>
                  </div>
                  <span className="shrink-0 border border-amber-300/30 px-1.5 py-1 text-[7px] font-bold uppercase tracking-[0.1em] text-amber-300">
                    Validar
                  </span>
                </div>
              </Link>
            ))}
            {aguardandoValidacao.length === 0 && (
              <div className="py-10 text-center text-[9px] uppercase tracking-widest text-white/25">
                Nenhum fluxo aguardando validação
              </div>
            )}
          </div>
          <div className="mt-4 border-t border-white/10 pt-4 text-[8px] uppercase tracking-[0.14em] text-white/25">
            Visão: {role || "usuário"} · dados conforme suas permissões
          </div>
        </aside>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-[#39FF14]">
              / / Previsão
            </div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/30">
              Semana{" "}
              {inicioSemana.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}—
              {fimSemana.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </div>
          </div>
          <Link
            to="/previsao"
            className="text-[8px] uppercase tracking-[0.14em] text-[#39FF14]/65 transition hover:text-[#39FF14]"
          >
            Abrir Previsão →
          </Link>
        </div>

        <div className="grid min-h-[300px] place-items-center gap-8 border border-[#39FF14]/25 bg-black/70 p-6 sm:grid-cols-[220px_1fr]">
          <CyberProgressRing
            percentual={percentualPrevisao}
            valor={`${percentualPrevisao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            rotulo="Realizado"
            ariaLabel={`Previsão realizada em ${percentualPrevisao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          />
          <div className="grid w-full gap-px bg-white/10 sm:grid-cols-3">
            <div className="bg-black/85 p-5">
              <div className="text-[8px] uppercase tracking-[0.18em] text-white/35">Previsão</div>
              <div className="mt-2 font-mono text-4xl font-light text-white">
                {previsaoAtual.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="bg-black/85 p-5">
              <div className="text-[8px] uppercase tracking-[0.18em] text-white/35">Realizado</div>
              <div className="mt-2 font-mono text-4xl font-light text-[#39FF14]">
                {realizadoAtual.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="bg-black/85 p-5">
              <div className="text-[8px] uppercase tracking-[0.18em] text-white/35">Saldo</div>
              <div className="mt-2 font-mono text-4xl font-light text-white">
                {saldoPrevisao.toLocaleString("pt-BR")}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Mini({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.025] px-2 py-2">
      <div className="font-mono text-lg font-bold text-white">{valor}</div>
      <div className="text-[7px] uppercase tracking-[0.12em] text-white/30">{rotulo}</div>
    </div>
  );
}
function Pulso({
  titulo,
  valor,
  texto,
  to,
}: {
  titulo: string;
  valor: string;
  texto: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="border border-white/10 bg-black/60 p-4 transition hover:border-[#39FF14]/55"
    >
      <div className="text-[8px] uppercase tracking-[0.18em] text-white/35">{titulo}</div>
      <div className="mt-3 font-mono text-xl font-bold text-[#39FF14]">{valor}</div>
      <div className="mt-2 text-[9px] text-white/30">{texto}</div>
      <div className="mt-4 text-right text-[8px] uppercase tracking-[0.14em] text-[#39FF14]/60">
        Abrir módulo →
      </div>
    </Link>
  );
}
function Status({ status }: { status: string }) {
  const classe =
    status === "validado"
      ? "text-[#39FF14] border-[#39FF14]/30"
      : status === "finalizado"
        ? "text-amber-300 border-amber-300/30"
        : "text-white/40 border-white/15";
  return (
    <span
      className={`shrink-0 border px-1.5 py-1 text-[7px] font-bold uppercase tracking-[0.1em] ${classe}`}
    >
      {status}
    </span>
  );
}
