export type TipoFormulario = "verba_cury" | "gastos_pessoais" | "contratacao" | "meta" | "leads" | "planejamento" | "acelera_vendas";

export const TIPOS_FORMULARIO: { value: TipoFormulario; label: string; descricao: string }[] = [
  { value: "verba_cury", label: "// Verba Cury", descricao: "Orçamento Agilitas + Marketing com lançamentos" },
  { value: "gastos_pessoais", label: "// GASTOS PESSOAIS", descricao: "Lançamentos por tipo de gasto" },
  { value: "contratacao", label: "// CONTRATAÇÃO", descricao: "Candidatos, contratados, gerente e fonte" },
  { value: "meta", label: "Relatório Meta", descricao: "Lançamentos com gerente e arquivo" },
  { value: "planejamento", label: "// PLANEJAMENTO", descricao: "Metas e verbas por gerente e plantão" },
];

// Mantido apenas para legendas/labels de registros antigos (não criável pelo usuário).
export const TIPO_LABELS_LEGACY: Record<string, string> = {
  acelera_vendas: "Acelera Vendas",
  leads: "Leads",
};

export const TIPOS_GASTO = [
  "Ação de Rua",
  "Ajuda de Custo",
  "Assistente",
  "Contratação",
  "Corujão",
  "CRECI E TTI",
  "Evento",
  "Gestor de Trafego",
  "Leads",
  "Marketing",
  "Material de Apoio",
  "Premiação",
] as const;

export type Destinacao = "Gerar Venda" | "Manutencao";

const TIPOS_GERAR_VENDA = new Set<string>(["Ação de Rua", "Gestor de Trafego", "Leads"]);

export function destinacaoFromTipoGasto(tipo?: string | null): Destinacao {
  if (!tipo) return "Manutencao";
  return TIPOS_GERAR_VENDA.has(tipo) ? "Gerar Venda" : "Manutencao";
}

export function tipoLabel(tipo?: string | null): string {
  return (
    TIPOS_FORMULARIO.find((t) => t.value === tipo)?.label ||
    (tipo ? TIPO_LABELS_LEGACY[tipo] : undefined) ||
    "Verba Cury"
  );
}

// ===== Helpers semanas (Segunda → Domingo) =====
export interface SemanaOpt {
  inicio: string; // YYYY-MM-DD
  fim: string;    // YYYY-MM-DD
  label: string;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function toISO(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toBR(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }

/** Retorna semanas (segunda→domingo) que tocam o mês informado (1-12). */
export function semanasDoMes(mes: number, ano: number): SemanaOpt[] {
  const first = new Date(ano, mes - 1, 1);
  // recua até segunda-feira (getDay: 0=dom, 1=seg, ...)
  const wd = first.getDay();
  const diffToMon = wd === 0 ? -6 : 1 - wd;
  const start = new Date(ano, mes - 1, 1 + diffToMon);
  const out: SemanaOpt[] = [];
  for (let i = 0; i < 6; i++) {
    const ini = new Date(start);
    ini.setDate(start.getDate() + i * 7);
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 6);
    // só inclui semanas cuja maior parte (qualquer dia útil) toca o mês
    if (fim.getMonth() < mes - 1 && fim.getFullYear() <= ano) continue;
    if (ini.getMonth() > mes - 1 && ini.getFullYear() >= ano) break;
    out.push({
      inicio: toISO(ini),
      fim: toISO(fim),
      label: `${toBR(ini)} → ${toBR(fim)}`,
    });
  }
  return out;
}
