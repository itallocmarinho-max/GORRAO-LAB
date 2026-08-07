import { useEffect, useState } from "react";
import { BarChart3, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resumoInicioLoad,
  type ResumoInicio,
  type ResumoSup,
} from "@/functions/resumo-inicio.functions";

type Mode = "mes" | "semana";
type MetricKey = keyof Pick<
  ResumoSup,
  | "vendas"
  | "leads"
  | "checkins"
  | "visitas"
  | "pastas"
  | "ab"
  | "previsao"
  | "diferenca"
  | "candidatos"
  | "contratados"
  | "cadastrosRh"
>;

type SummaryRow =
  | { type: "section"; label: string; detail?: string }
  | { type: "metric"; label: string; key: MetricKey; accent?: boolean; difference?: boolean }
  | { type: "space" };

const rows: SummaryRow[] = [
  { type: "section", label: "OPERAÇÃO", detail: "Origem e conversão" },
  { type: "metric", label: "Vendas", key: "vendas", accent: true },
  { type: "metric", label: "Leads", key: "leads" },
  { type: "metric", label: "Check-ins", key: "checkins" },
  { type: "metric", label: "Visitas", key: "visitas" },
  { type: "metric", label: "Pastas", key: "pastas" },
  { type: "metric", label: "AB", key: "ab" },
  { type: "space" },
  { type: "section", label: "PREVISÃO", detail: "Previsto versus realizado" },
  { type: "metric", label: "Previsão", key: "previsao" },
  { type: "metric", label: "Vendas", key: "vendas", accent: true },
  { type: "metric", label: "Diferença", key: "diferenca", difference: true },
  { type: "space" },
  { type: "section", label: "CONTRATAÇÕES", detail: "Funil de pessoas" },
  { type: "metric", label: "Candidatos", key: "candidatos" },
  { type: "metric", label: "Contratados", key: "contratados", accent: true },
  { type: "metric", label: "Cadastros no RH", key: "cadastrosRh" },
];

const LOADER_SYMBOLS = ["slashes", "astronaut", "star", "planet"] as const;

function todayMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ResumoInicioButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<Mode>("mes");
  const [month, setMonth] = useState(todayMonth);
  const [week, setWeek] = useState(todayDate);
  const [summary, setSummary] = useState<ResumoInicio | null>(null);

  const reference = mode === "mes" ? month : week;

  const load = async (fullScreen: boolean) => {
    if (!token) return;
    if (fullScreen) setLoadingScreen(true);
    else setRefreshing(true);
    try {
      const request = resumoInicioLoad({ data: { token, modo: mode, referencia: reference } });
      const result = fullScreen
        ? (await Promise.all([request, new Promise((resolve) => setTimeout(resolve, 1800))]))[0]
        : await request;
      setSummary(result);
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível montar o resumo");
    } finally {
      setLoadingScreen(false);
      setRefreshing(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => void load(true)}
        disabled={!token || loadingScreen}
        className="rounded-none border-[#39FF14]/45 bg-black/65 text-[9px] font-bold uppercase tracking-[0.2em] text-[#39FF14] hover:bg-[#39FF14]/10 hover:text-[#39FF14]"
      >
        <BarChart3 className="mr-2 h-4 w-4" /> Resumo
      </Button>

      {loadingScreen && <CosmicLoader />}

      {open && summary && (
        <div className="fixed inset-x-0 bottom-0 top-[72px] z-[190] flex items-start justify-center overflow-hidden bg-black/85 p-2 backdrop-blur-xl sm:p-4">
          <div className="flex max-h-[calc(100vh-88px)] w-full max-w-[1600px] flex-col overflow-hidden border border-[#39FF14]/35 bg-[#030503]/95 shadow-[0_0_70px_rgba(57,255,20,.12)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-[#39FF14]/20 px-4 py-3 sm:px-6">
              <div className="mr-auto">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[#39FF14]">
                  / / Resumo consolidado
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-white/35">
                  {summary.periodoLabel} · superintendentes em ordem alfabética
                </div>
              </div>
              <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
                <SelectTrigger className="h-9 w-28 rounded-none border-white/15 bg-black text-[9px] uppercase tracking-wider text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none border-[#39FF14]/30 bg-black text-white">
                  <SelectItem value="mes">Mês</SelectItem>
                  <SelectItem value="semana">Semana</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type={mode === "mes" ? "month" : "date"}
                value={reference}
                onChange={(event) =>
                  mode === "mes" ? setMonth(event.target.value) : setWeek(event.target.value)
                }
                className="h-9 w-[155px] rounded-none border-white/15 bg-black text-xs text-white"
              />
              <Button
                type="button"
                onClick={() => void load(false)}
                disabled={refreshing || !reference}
                className="h-9 rounded-none bg-[#39FF14] text-[9px] font-black uppercase tracking-[0.16em] text-black hover:bg-[#39FF14]/80"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="h-9 w-9 rounded-none text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Fechar resumo"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-max border-collapse text-right">
                <thead className="sticky top-0 z-20 bg-[#050705]">
                  <tr className="border-b border-[#39FF14]/25">
                    <th className="sticky left-0 z-30 min-w-[190px] bg-[#050705] px-5 py-4 text-left text-[8px] font-medium uppercase tracking-[0.2em] text-white/35">
                      Indicador
                    </th>
                    {summary.superintendentes.map((sup) => (
                      <th
                        key={sup.id}
                        className="min-w-[145px] border-l border-white/[0.07] px-4 py-4 text-center text-[9px] font-black uppercase tracking-[0.16em] text-[#39FF14]"
                      >
                        {sup.nome}
                      </th>
                    ))}
                    <th className="min-w-[125px] border-l border-[#39FF14]/20 bg-[#39FF14]/[0.04] px-4 py-4 text-center text-[9px] font-black uppercase tracking-[0.16em] text-[#39FF14]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <SummaryTableRow
                      key={`${row.type}-${"label" in row ? row.label : index}`}
                      row={row}
                      supers={summary.superintendentes}
                    />
                  ))}
                  {!summary.superintendentes.length && (
                    <tr>
                      <td colSpan={2} className="px-5 py-16 text-center text-xs text-white/35">
                        Nenhum superintendente disponível para este período e perfil de acesso.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-white/10 px-4 py-3 text-[8px] uppercase tracking-[0.12em] text-white/25 sm:px-6">
              <span>Vendas, Leads, PV e AB: bases importadas</span>
              <span>Contratações: somente formulários validados</span>
              <span>— = fonte ainda não integrada</span>
              <span>Diferença = vendas − previsão</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SummaryTableRow({ row, supers }: { row: SummaryRow; supers: ResumoSup[] }) {
  if (row.type === "space") {
    return (
      <tr aria-hidden>
        <td className="h-7 bg-black" colSpan={supers.length + 2} />
      </tr>
    );
  }
  if (row.type === "section") {
    return (
      <tr className="border-y border-[#39FF14]/15 bg-[#39FF14]/[0.035]">
        <td
          className="sticky left-0 z-10 bg-[#071007] px-5 py-3 text-left"
          colSpan={supers.length + 2}
        >
          <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#39FF14]">
            {row.label}
          </span>
          {row.detail && (
            <span className="ml-3 text-[8px] uppercase tracking-[0.12em] text-white/25">
              {row.detail}
            </span>
          )}
        </td>
      </tr>
    );
  }

  const values = supers.map((sup) => sup[row.key]);
  const numericValues = values.filter((value): value is number => typeof value === "number");
  const total =
    numericValues.length === values.length
      ? numericValues.reduce((sum, value) => sum + value, 0)
      : null;
  return (
    <tr className="border-b border-white/[0.06] transition-colors hover:bg-white/[0.025]">
      <th
        className={`sticky left-0 z-10 bg-[#040604] px-5 py-3 text-left text-[9px] uppercase tracking-[0.16em] ${row.accent ? "font-black text-[#39FF14]" : "font-medium text-white/55"}`}
      >
        {row.label}
      </th>
      {values.map((value, index) => (
        <td
          key={supers[index].id}
          className={`border-l border-white/[0.055] px-4 py-3 font-mono text-base tabular-nums ${cellColor(value, row)}`}
        >
          {formatValue(value, row.difference)}
        </td>
      ))}
      <td
        className={`border-l border-[#39FF14]/15 bg-[#39FF14]/[0.025] px-4 py-3 font-mono text-base font-bold tabular-nums ${cellColor(total, row)}`}
      >
        {formatValue(total, row.difference)}
      </td>
    </tr>
  );
}

function formatValue(value: number | null, signed = false) {
  if (value === null) return "—";
  const formatted = Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (!signed || value === 0) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function cellColor(value: number | null, row: Extract<SummaryRow, { type: "metric" }>) {
  if (value === null) return "text-white/20";
  if (row.difference) return value >= 0 ? "text-[#39FF14]" : "text-red-400";
  return row.accent ? "text-[#39FF14]" : "text-white/75";
}

function CosmicLoader() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % LOADER_SYMBOLS.length),
      380,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[210] grid place-items-center bg-black/90 backdrop-blur-2xl">
      <div className="text-center">
        <div className="relative mx-auto h-36 w-36">
          <div className="absolute inset-0 animate-spin rounded-full border border-white/5 border-t-[#39FF14] border-r-[#39FF14]/40 shadow-[0_0_32px_rgba(57,255,20,.18)]" />
          <div className="absolute inset-3 animate-[spin_2.2s_linear_infinite_reverse] rounded-full border border-dashed border-[#39FF14]/35" />
          <div className="absolute inset-0 grid place-items-center">
            <span
              key={LOADER_SYMBOLS[index]}
              className="animate-in zoom-in-75 fade-in grid h-12 w-12 place-items-center font-mono text-2xl font-light text-[#39FF14] duration-300"
            >
              <LoaderSymbol symbol={LOADER_SYMBOLS[index]} />
            </span>
          </div>
        </div>
        <div className="mt-6 text-[9px] font-black uppercase tracking-[0.28em] text-[#39FF14]">
          Consolidando operação
        </div>
        <div className="mt-2 text-[8px] uppercase tracking-[0.18em] text-white/25">
          Cruzando as bases por superintendente
        </div>
      </div>
    </div>
  );
}

function LoaderSymbol({ symbol }: { symbol: "slashes" | "astronaut" | "star" | "planet" }) {
  if (symbol === "slashes") return <span>/ /</span>;
  if (symbol === "astronaut") {
    return (
      <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" aria-hidden>
        <rect x="14" y="5" width="20" height="17" rx="8" stroke="currentColor" strokeWidth="1.7" />
        <path d="M18 12.5c3.8-2.4 8.2-2.4 12 0v4.2H18z" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M17 23.5h14l3 14H14z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m15.5 25-6 8.5M32.5 25l6 8.5M18.5 37.5l-2 6M29.5 37.5l2 6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M11 30.5 8 29M37 30.5l3-1.5M19.5 27h9v6h-9z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="30" r=".8" fill="currentColor" />
        <circle cx="26" cy="30" r=".8" fill="currentColor" />
      </svg>
    );
  }
  if (symbol === "star") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none" aria-hidden>
        <path
          d="m24 5 4.2 13.8L42 24l-13.8 5.2L24 43l-4.2-13.8L6 24l13.8-5.2z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7 29c6.5 2.8 19.2-.4 28.4-7.2 4.4-3.2 6.5-6.2 5.2-7.7-1.2-1.4-5.4-.3-10.4 2.3M17 31.7c-5.2 1.3-9.2 1-10.1-.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
