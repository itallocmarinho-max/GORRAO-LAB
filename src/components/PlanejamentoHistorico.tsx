import { useCallback, useEffect, useMemo, useState } from "react";
import type { CellValue } from "exceljs";
import { Link2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Diretor, Gerente, Superintendente } from "@/hooks/useHierarquia";
import {
  planejamentoHistoricoGerenteCreate,
  planejamentoHistoricoImport,
  planejamentoHistoricoVinculosList,
} from "@/functions/planejamento-historico.functions";
import { brl } from "@/lib/format";

type ImportKind = "vendas" | "verba";
type OrigemTipo = "diretor" | "superintendente" | "gerente";
type Campo =
  | "diretor"
  | "sup"
  | "gerente"
  | "meta_gerente"
  | "meta_sup"
  | "plantao"
  | "verba_cury"
  | "verba_sup"
  | "verba_gerente"
  | "mes"
  | "ano";

type SavedLink = {
  id: string;
  origem_tipo: OrigemTipo;
  alias: string;
  alias_normalizado: string;
  contexto_alias: string;
  contexto_normalizado: string;
  profile_id: string | null;
  gerente_id: string | null;
};

type KnownLink = {
  origem_tipo: OrigemTipo;
  alias: string;
  alias_normalizado: string;
  profile_id: string | null;
  gerente_id: string | null;
};

type ParsedRow = {
  linha: number;
  tipo: ImportKind;
  diretor: string;
  sup: string;
  gerente: string;
  mes: number;
  ano: number;
  meta_gerente?: number;
  meta_sup?: number;
  plantao?: string;
  verba_cury?: number;
  verba_sup?: number;
  verba_gerente?: number;
  ocorrencia?: number;
};

type TargetOption = {
  value: string;
  id: string;
  label: string;
};

const BASE_FIELDS: Array<{ key: Campo; label: string; aliases: string[] }> = [
  { key: "diretor", label: "Diretor", aliases: ["diretor", "diretoria"] },
  {
    key: "sup",
    label: "Superintendente",
    aliases: ["sup", "superintendente", "superintendencia"],
  },
  { key: "gerente", label: "Gerente", aliases: ["gerente", "gerencia"] },
  { key: "mes", label: "Mês", aliases: ["mes", "mês", "mes referencia"] },
  { key: "ano", label: "Ano", aliases: ["ano", "ano referencia"] },
];

const SALES_FIELDS: Array<{ key: Campo; label: string; aliases: string[] }> = [
  { key: "meta_gerente", label: "Meta gerente", aliases: ["meta gerente", "meta ger"] },
  { key: "meta_sup", label: "Meta SUP", aliases: ["meta sup", "meta superintendente"] },
  { key: "plantao", label: "Plantão", aliases: ["plantao", "plantão"] },
];

const BUDGET_FIELDS: Array<{ key: Campo; label: string; aliases: string[] }> = [
  { key: "verba_cury", label: "Verba Cury", aliases: ["verba cury", "cury"] },
  { key: "verba_sup", label: "Verba SUP", aliases: ["verba sup", "verba superintendente"] },
  { key: "verba_gerente", label: "Verba gerente", aliases: ["verba gerente"] },
];

const cyberButton =
  "h-9 rounded-none border border-[#39FF14]/55 bg-black/60 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#39FF14] hover:border-[#39FF14] hover:bg-[#39FF14]/10 hover:text-[#39FF14]";
const cyberInput =
  "h-9 rounded-none border-[#39FF14]/30 bg-black/60 text-xs text-white placeholder:text-white/25 focus-visible:border-[#39FF14] focus-visible:ring-0";

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellValue(value: CellValue): unknown {
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    if ("result" in value) return value.result;
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map((item) => item.text).join("");
  }
  return value;
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function parseMonth(value: unknown): number {
  if (value instanceof Date) return value.getMonth() + 1;
  const number = Number(value);
  if (Number.isInteger(number) && number >= 1 && number <= 12) return number;
  const text = normalize(value);
  const months = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const index = months.findIndex(
    (month) => month.startsWith(text) || text.startsWith(month.slice(0, 3)),
  );
  return index >= 0 ? index + 1 : 0;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  let text = String(value ?? "")
    .trim()
    .replace(/[^0-9,.-]/g, "");
  if (!text) return Number.NaN;
  if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
  else if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function decodeTarget(value: string): { type: OrigemTipo; id: string } | null {
  const [type, id] = value.split(":");
  if (!id || !["diretor", "superintendente", "gerente"].includes(type)) return null;
  return { type: type as OrigemTipo, id };
}

function savedTarget(link: SavedLink | KnownLink): string {
  return `${link.origem_tipo}:${link.origem_tipo === "gerente" ? link.gerente_id : link.profile_id}`;
}

function savedKey(type: OrigemTipo, alias: string, context = "") {
  return `${type}:${normalize(alias)}:${type === "gerente" ? normalize(context) : ""}`;
}

export function PlanejamentoHistorico({
  token,
  diretores,
  superintendentes,
  gerentes,
  onImported,
}: {
  token: string;
  diretores: Diretor[];
  superintendentes: Superintendente[];
  gerentes: Gerente[];
  onImported: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ImportKind>("vendas");
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [knownLinks, setKnownLinks] = useState<KnownLink[]>([]);
  const [localManagers, setLocalManagers] = useState<Gerente[]>(gerentes);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<Campo, string>>>({});
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [quickManager, setQuickManager] = useState<{
    key: string;
    alias: string;
    supAlias: string;
  } | null>(null);
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerSup, setNewManagerSup] = useState("");
  const [creatingManager, setCreatingManager] = useState(false);

  useEffect(() => {
    setLocalManagers((current) => {
      const merged = new Map([...current, ...gerentes].map((item) => [item.id, item]));
      return Array.from(merged.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    });
  }, [gerentes]);

  const fields = useMemo(
    () => [...BASE_FIELDS, ...(kind === "vendas" ? SALES_FIELDS : BUDGET_FIELDS)],
    [kind],
  );

  const targetOptions = useMemo<Record<OrigemTipo, TargetOption[]>>(
    () => ({
      diretor: diretores
        .map((item) => ({ value: `diretor:${item.id}`, id: item.id, label: item.nome }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      superintendente: superintendentes
        .map((item) => ({ value: `superintendente:${item.id}`, id: item.id, label: item.nome }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      gerente: localManagers
        .map((item) => {
          const sup = superintendentes.find(
            (candidate) => candidate.id === item.superintendente_id,
          );
          return {
            value: `gerente:${item.id}`,
            id: item.id,
            label: `${item.nome} · ${sup?.nome || "SEM SUP"}`,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    }),
    [diretores, superintendentes, localManagers],
  );

  const loadLinks = useCallback(async () => {
    if (!token) return;
    setLoadingLinks(true);
    try {
      const result = await planejamentoHistoricoVinculosList({ data: { token } });
      setSavedLinks((result.rows ?? []) as SavedLink[]);
      setKnownLinks((result.known ?? []) as KnownLink[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar vínculos");
    } finally {
      setLoadingLinks(false);
    }
  }, [token]);

  const resetFile = () => {
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setFileName("");
    setFileError("");
    setSelections({});
    setQuickManager(null);
  };

  const changeOpen = async (next: boolean) => {
    setOpen(next);
    if (next) await loadLinks();
    else resetFile();
  };

  const applyRows = (matrix: unknown[][]) => {
    const headerRow = (matrix[0] ?? []).map(
      (value, index) => String(value ?? "").trim() || `COLUNA ${index + 1}`,
    );
    const rows = matrix
      .slice(1)
      .filter((row) => row.some((value) => String(value ?? "").trim()))
      .map((row) =>
        Object.fromEntries(headerRow.map((header, index) => [header, row[index] ?? null])),
      );
    if (!headerRow.length || !rows.length)
      throw new Error("A tabela não possui linhas para importar");
    const guessed: Partial<Record<Campo, string>> = {};
    for (const field of fields) {
      const header = headerRow.find((candidate) =>
        field.aliases.some((alias) => normalize(candidate) === normalize(alias)),
      );
      if (header) guessed[field.key] = header;
    }
    setHeaders(headerRow);
    setRawRows(rows);
    setMapping(guessed);
  };

  const readFile = async (file: File) => {
    setFileError("");
    setFileName(file.name);
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        applyRows(parseCsv(await file.text()));
      } else {
        const { default: ExcelJS } = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error("A planilha não possui abas");
        const matrix: unknown[][] = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const values: unknown[] = [];
          for (let column = 1; column <= sheet.columnCount; column += 1) {
            values.push(cellValue(row.getCell(column).value));
          }
          matrix.push(values);
        });
        applyRows(matrix);
      }
    } catch (error) {
      resetFile();
      const message = error instanceof Error ? error.message : "Não foi possível ler o arquivo";
      setFileError(message);
      toast.error(message);
    }
  };

  const parsed = useMemo(() => {
    const valid: ParsedRow[] = [];
    const invalid: Array<{ linha: number; reason: string }> = [];
    rawRows.forEach((row, index) => {
      const line = index + 2;
      const director = String(mapping.diretor ? (row[mapping.diretor] ?? "") : "").trim();
      const sup = String(mapping.sup ? (row[mapping.sup] ?? "") : "").trim();
      const manager = String(mapping.gerente ? (row[mapping.gerente] ?? "") : "").trim();
      const month = parseMonth(mapping.mes ? row[mapping.mes] : null);
      const year = Number(mapping.ano ? row[mapping.ano] : 0);
      const problems: string[] = [];
      if (!director) problems.push("diretor vazio");
      if (!sup) problems.push("SUP vazio");
      if (!manager) problems.push("gerente vazio");
      if (month < 1 || month > 12) problems.push("mês inválido");
      if (!Number.isInteger(year) || year < 2000 || year > 2100) problems.push("ano inválido");
      const base = {
        linha: line,
        tipo: kind,
        diretor: director,
        sup,
        gerente: manager,
        mes: month,
        ano: year,
      };
      if (kind === "vendas") {
        const managerGoal = parseNumber(mapping.meta_gerente ? row[mapping.meta_gerente] : null);
        const supGoal = parseNumber(mapping.meta_sup ? row[mapping.meta_sup] : null);
        const duty = String(mapping.plantao ? (row[mapping.plantao] ?? "") : "").trim();
        if (!Number.isFinite(managerGoal) || managerGoal < 0)
          problems.push("meta gerente inválida");
        if (!Number.isFinite(supGoal) || supGoal < 0) problems.push("meta SUP inválida");
        if (!duty) problems.push("plantão vazio");
        if (!problems.length) {
          valid.push({
            ...base,
            tipo: "vendas",
            meta_gerente: managerGoal,
            meta_sup: supGoal,
            plantao: duty,
          });
        }
      } else {
        const cury = parseNumber(mapping.verba_cury ? row[mapping.verba_cury] : null);
        const supBudget = parseNumber(mapping.verba_sup ? row[mapping.verba_sup] : null);
        const managerBudget = parseNumber(
          mapping.verba_gerente ? row[mapping.verba_gerente] : null,
        );
        if (!Number.isFinite(cury) || cury < 0) problems.push("verba Cury inválida");
        if (!Number.isFinite(supBudget) || supBudget < 0) problems.push("verba SUP inválida");
        if (!Number.isFinite(managerBudget) || managerBudget < 0) {
          problems.push("verba gerente inválida");
        }
        if (!problems.length) {
          valid.push({
            ...base,
            tipo: "verba",
            verba_cury: cury,
            verba_sup: supBudget,
            verba_gerente: managerBudget,
          });
        }
      }
      if (problems.length) invalid.push({ linha: line, reason: problems.join(", ") });
    });
    return { valid, invalid };
  }, [kind, mapping, rawRows]);

  const uniqueDirectors = useMemo(
    () =>
      Array.from(
        new Map(parsed.valid.map((row) => [normalize(row.diretor), row.diretor])).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1], "pt-BR")),
    [parsed.valid],
  );
  const uniqueSups = useMemo(
    () =>
      Array.from(new Map(parsed.valid.map((row) => [normalize(row.sup), row.sup])).entries()).sort(
        (a, b) => a[1].localeCompare(b[1], "pt-BR"),
      ),
    [parsed.valid],
  );
  const uniqueManagers = useMemo(() => {
    const map = new Map<string, { alias: string; supAlias: string }>();
    for (const row of parsed.valid) {
      const key = `${normalize(row.sup)}|${normalize(row.gerente)}`;
      if (!map.has(key)) map.set(key, { alias: row.gerente, supAlias: row.sup });
    }
    return Array.from(map.entries()).sort((a, b) =>
      `${a[1].supAlias} ${a[1].alias}`.localeCompare(`${b[1].supAlias} ${b[1].alias}`, "pt-BR"),
    );
  }, [parsed.valid]);

  const savedMap = useMemo(
    () =>
      new Map(
        savedLinks.map((link) => [
          savedKey(link.origem_tipo, link.alias, link.contexto_alias),
          savedTarget(link),
        ]),
      ),
    [savedLinks],
  );
  const knownMap = useMemo(
    () =>
      new Map(
        knownLinks.map((link) => [
          `${link.origem_tipo}:${link.alias_normalizado}`,
          savedTarget(link),
        ]),
      ),
    [knownLinks],
  );

  const exactTarget = (type: OrigemTipo, alias: string, context = "") => {
    if (type === "diretor") {
      const match = diretores.find((item) => normalize(item.nome) === normalize(alias));
      return match ? `diretor:${match.id}` : "";
    }
    if (type === "superintendente") {
      const match = superintendentes.find((item) => normalize(item.nome) === normalize(alias));
      return match ? `superintendente:${match.id}` : "";
    }
    const supTarget = currentTarget("superintendente", context);
    const supId = decodeTarget(supTarget)?.id;
    const match = localManagers.find(
      (item) => item.superintendente_id === supId && normalize(item.nome) === normalize(alias),
    );
    return match ? `gerente:${match.id}` : "";
  };

  function currentTarget(type: OrigemTipo, alias: string, context = "") {
    const key = savedKey(type, alias, context);
    const selected = selections[key];
    if (selected) return selected;
    const saved = savedMap.get(key);
    if (saved) {
      if (type !== "gerente") return saved;
      const manager = localManagers.find((item) => item.id === decodeTarget(saved)?.id);
      const supId = decodeTarget(currentTarget("superintendente", context))?.id;
      if (manager?.superintendente_id === supId) return saved;
    }
    const known = knownMap.get(`${type}:${normalize(alias)}`) || "";
    if (known) {
      if (type !== "gerente") return known;
      const manager = localManagers.find((item) => item.id === decodeTarget(known)?.id);
      const supId = decodeTarget(currentTarget("superintendente", context))?.id;
      if (manager?.superintendente_id === supId) return known;
    }
    return exactTarget(type, alias, context);
  }

  const unresolved =
    uniqueDirectors.filter(([, alias]) => !currentTarget("diretor", alias)).length +
    uniqueSups.filter(([, alias]) => !currentTarget("superintendente", alias)).length +
    uniqueManagers.filter(([, item]) => !currentTarget("gerente", item.alias, item.supAlias))
      .length;
  const missingFields = fields.filter((field) => !mapping[field.key]);

  const choose = (type: OrigemTipo, alias: string, value: string, context = "") => {
    setSelections((current) => ({ ...current, [savedKey(type, alias, context)]: value }));
  };

  const isSuggested = (type: OrigemTipo, alias: string, context = "") => {
    const key = savedKey(type, alias, context);
    return !selections[key] && !savedMap.has(key) && Boolean(currentTarget(type, alias, context));
  };

  const startManagerCreate = (key: string, alias: string, supAlias: string) => {
    const supTarget = currentTarget("superintendente", supAlias);
    const supId = decodeTarget(supTarget)?.id || "";
    if (!supId) return toast.error("Vincule primeiro o superintendente desta equipe");
    setQuickManager({ key, alias, supAlias });
    setNewManagerName(alias);
    setNewManagerSup(supId);
  };

  const createManager = async () => {
    if (!quickManager || !newManagerName.trim() || !newManagerSup) {
      return toast.error("Informe nome e superintendente");
    }
    setCreatingManager(true);
    try {
      const result = await planejamentoHistoricoGerenteCreate({
        data: {
          token,
          nome: newManagerName.trim(),
          superintendente_id: newManagerSup,
          alias: quickManager.alias,
          contexto_alias: quickManager.supAlias,
        },
      });
      const created = result.gerente as Gerente;
      setLocalManagers((current) =>
        Array.from(new Map([...current, created].map((item) => [item.id, item])).values()).sort(
          (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
        ),
      );
      choose("gerente", quickManager.alias, `gerente:${created.id}`, quickManager.supAlias);
      toast.success(
        result.created ? "Gerente cadastrado e vinculado" : "Gerente existente vinculado",
      );
      setQuickManager(null);
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar gerente");
    } finally {
      setCreatingManager(false);
    }
  };

  const importRows = async () => {
    if (missingFields.length) return toast.error("Mapeie todas as colunas obrigatórias");
    if (!parsed.valid.length) return toast.error("Não há linhas válidas para importar");
    if (parsed.invalid.length) {
      return toast.error("Corrija ou remova as linhas inválidas antes de importar");
    }
    if (unresolved) return toast.error("Vincule todos os nomes antes de importar");

    const links = [
      ...uniqueDirectors.map(([, alias]) => ({
        origem_tipo: "diretor" as const,
        alias,
        contexto_alias: "",
        target_id: decodeTarget(currentTarget("diretor", alias))!.id,
      })),
      ...uniqueSups.map(([, alias]) => ({
        origem_tipo: "superintendente" as const,
        alias,
        contexto_alias: "",
        target_id: decodeTarget(currentTarget("superintendente", alias))!.id,
      })),
      ...uniqueManagers.map(([, item]) => ({
        origem_tipo: "gerente" as const,
        alias: item.alias,
        contexto_alias: item.supAlias,
        target_id: decodeTarget(currentTarget("gerente", item.alias, item.supAlias))!.id,
      })),
    ];

    const occurrences = new Map<string, number>();
    const rows = parsed.valid.map((row) => {
      const content = JSON.stringify({ ...row, linha: undefined });
      const occurrence = (occurrences.get(content) ?? 0) + 1;
      occurrences.set(content, occurrence);
      return { ...row, ocorrencia: occurrence };
    });
    const chunkSize = 120;
    const totalChunks = Math.ceil(rows.length / chunkSize);
    let imported = 0;
    let ignored = 0;
    setImporting(true);
    try {
      for (let index = 0; index < rows.length; index += chunkSize) {
        setProgress({ current: Math.floor(index / chunkSize) + 1, total: totalChunks });
        const result = await planejamentoHistoricoImport({
          data: { token, rows: rows.slice(index, index + chunkSize), vinculos: links },
        });
        imported += result.imported;
        ignored += result.ignored;
      }
      toast.success(
        `${imported} linha(s) importada(s)${ignored ? ` · ${ignored} já existente(s)` : ""}`,
      );
      setOpen(false);
      resetFile();
      await onImported();
    } catch (error) {
      const prefix = imported
        ? `${imported} linha(s) foram gravadas antes da interrupção. Pode tentar novamente. `
        : "";
      toast.error(prefix + (error instanceof Error ? error.message : "Erro ao importar"), {
        duration: 10000,
      });
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const LinkRow = ({
    type,
    alias,
    context = "",
    allowCreate = false,
  }: {
    type: OrigemTipo;
    alias: string;
    context?: string;
    allowCreate?: boolean;
  }) => {
    const key = savedKey(type, alias, context);
    const value = currentTarget(type, alias, context);
    const options =
      type === "gerente"
        ? targetOptions.gerente.filter((option) => {
            const manager = localManagers.find((item) => item.id === option.id);
            const supId = decodeTarget(currentTarget("superintendente", context))?.id;
            return manager?.superintendente_id === supId;
          })
        : targetOptions[type];
    return (
      <div className="grid grid-cols-[minmax(100px,.8fr)_minmax(180px,1.2fr)_auto] items-center gap-2 border-b border-white/[0.06] py-2 last:border-0">
        <div className="min-w-0">
          <div className="truncate text-[10px] text-white/70" title={alias}>
            {alias}
          </div>
          {context && (
            <div className="truncate text-[7px] uppercase tracking-wider text-white/25">
              SUP · {context}
            </div>
          )}
        </div>
        <div className="relative">
          <Select value={value} onValueChange={(next) => choose(type, alias, next, context)}>
            <SelectTrigger className={cyberInput}>
              <SelectValue placeholder="VINCULAR..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label.toLocaleUpperCase("pt-BR")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSuggested(type, alias, context) && (
            <span className="absolute -right-1 -top-1 bg-[#39FF14] px-1 text-[6px] font-black uppercase tracking-wider text-black">
              Sugerido
            </span>
          )}
        </div>
        {allowCreate ? (
          <button
            type="button"
            onClick={() => startManagerCreate(key, alias, context)}
            className="grid h-9 w-9 place-items-center border border-[#39FF14]/30 text-[#39FF14] transition hover:border-[#39FF14] hover:bg-[#39FF14]/10"
            title="Cadastrar este gerente"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="w-9" />
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cyberButton}>
          <Link2 className="mr-1 h-3.5 w-3.5" /> Histórico planejamento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-7xl overflow-y-auto rounded-none border border-[#39FF14]/40 bg-black/95 text-white shadow-[0_0_55px_rgba(57,255,20,0.12)] backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-[0.22em] text-[#39FF14]">
            / / Importação histórica · planejamento
          </DialogTitle>
        </DialogHeader>

        {!rawRows.length ? (
          <div className="space-y-5 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setKind("vendas")}
                className={`border p-4 text-left transition ${kind === "vendas" ? "border-[#39FF14] bg-[#39FF14]/10" : "border-white/10 bg-white/[0.02]"}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14]">
                  Planejamento de vendas
                </div>
                <div className="mt-2 text-[9px] leading-5 text-white/40">
                  Diretor, SUP, gerente, metas, plantão, mês e ano.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setKind("verba")}
                className={`border p-4 text-left transition ${kind === "verba" ? "border-[#39FF14] bg-[#39FF14]/10" : "border-white/10 bg-white/[0.02]"}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14]">
                  Planejamento de verba
                </div>
                <div className="mt-2 text-[9px] leading-5 text-white/40">
                  Diretor, SUP, gerente, verbas Cury/SUP/gerente, mês e ano.
                </div>
              </button>
            </div>
            <div className="border border-dashed border-[#39FF14]/35 bg-[#39FF14]/[0.025] p-8 text-center">
              <Upload className="mx-auto mb-3 h-7 w-7 text-[#39FF14]" />
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-white">
                Selecione a planilha de {kind === "vendas" ? "vendas" : "verba"}
              </div>
              <p className="mx-auto mt-2 max-w-xl text-[10px] leading-5 text-white/40">
                Formatos aceitos: XLSX e CSV. A primeira linha deve conter os títulos das colunas.
              </p>
              <Input
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readFile(file);
                }}
                className="mx-auto mt-4 max-w-md cursor-pointer rounded-none border-[#39FF14]/30 bg-black/50 text-xs file:text-[#39FF14]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {fields.map((field) => (
                <div
                  key={field.key}
                  className="border border-white/10 bg-white/[0.02] px-3 py-2 text-[9px] uppercase tracking-wider text-white/50"
                >
                  {field.label} <span className="text-[#39FF14]">*</span>
                </div>
              ))}
            </div>
            {fileError && (
              <div className="border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                {fileError}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">
                  {kind === "vendas" ? "Planejamento de vendas" : "Planejamento de verba"}
                </div>
                <div className="mt-1 text-xs font-bold text-white">{fileName}</div>
              </div>
              <button
                type="button"
                onClick={resetFile}
                className="text-[9px] font-bold uppercase tracking-widest text-[#39FF14] hover:underline"
              >
                Trocar arquivo
              </button>
            </div>

            <section>
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#39FF14]">
                01 · Colunas da tabela
              </h3>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {fields.map((field) => (
                  <div key={field.key}>
                    <Label className="mb-1 block text-[9px] uppercase tracking-wider text-white/45">
                      {field.label} <span className="text-[#39FF14]">*</span>
                    </Label>
                    <Select
                      value={mapping[field.key] || "__none"}
                      onValueChange={(value) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]: value === "__none" ? undefined : value,
                        }))
                      }
                    >
                      <SelectTrigger className={cyberInput}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">NÃO MAPEAR</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {missingFields.length > 0 && (
                <p className="mt-2 text-[10px] text-amber-300">
                  Mapeie: {missingFields.map((field) => field.label).join(", ")}.
                </p>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#39FF14]">
                  02 · Vínculos das equipes
                </h3>
                <span className="text-[9px] uppercase tracking-wider text-white/35">
                  {loadingLinks ? "Carregando..." : `${unresolved} pendente(s)`}
                </span>
              </div>
              <p className="mb-3 text-[9px] leading-5 text-white/35">
                Vínculos já salvos em Vendas e Verba Cury são sugeridos automaticamente. Confira e
                altere somente quando necessário.
              </p>
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="border border-white/10">
                  <div className="border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
                    Diretor da tabela
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {uniqueDirectors.map(([, alias]) => (
                      <LinkRow key={normalize(alias)} type="diretor" alias={alias} />
                    ))}
                  </div>
                </div>
                <div className="border border-white/10">
                  <div className="border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
                    Superintendente da tabela
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {uniqueSups.map(([, alias]) => (
                      <LinkRow key={normalize(alias)} type="superintendente" alias={alias} />
                    ))}
                  </div>
                </div>
                <div className="border border-white/10">
                  <div className="border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
                    Gerente da tabela · por equipe
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {uniqueManagers.map(([key, item]) => (
                      <LinkRow
                        key={key}
                        type="gerente"
                        alias={item.alias}
                        context={item.supAlias}
                        allowCreate
                      />
                    ))}
                  </div>
                </div>
              </div>

              {quickManager && (
                <div className="mt-3 border border-[#39FF14]/30 bg-[#39FF14]/[0.035] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#39FF14]">
                      / / Cadastrar gerente sem sair da importação
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuickManager(null)}
                      className="text-[8px] uppercase tracking-wider text-white/35"
                    >
                      Fechar
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_auto]">
                    <Input
                      value={newManagerName}
                      onChange={(event) => setNewManagerName(event.target.value)}
                      placeholder="NOME DO GERENTE"
                      className={cyberInput}
                    />
                    <Select value={newManagerSup} onValueChange={setNewManagerSup}>
                      <SelectTrigger className={cyberInput}>
                        <SelectValue placeholder="SUPERINTENDENTE" />
                      </SelectTrigger>
                      <SelectContent>
                        {superintendentes.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.nome.toLocaleUpperCase("pt-BR")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      onClick={createManager}
                      disabled={creatingManager}
                      className="h-9 rounded-none bg-[#39FF14] px-4 text-[9px] font-black uppercase tracking-widest text-black hover:bg-[#39FF14]/80"
                    >
                      {creatingManager ? "Salvando" : "Cadastrar e vincular"}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#39FF14]">
                  03 · Conferência
                </h3>
                <div className="flex gap-5 text-right">
                  <div>
                    <div className="font-mono text-lg text-white">{parsed.valid.length}</div>
                    <div className="text-[7px] uppercase tracking-wider text-white/30">Válidas</div>
                  </div>
                  <div>
                    <div className="font-mono text-lg text-red-300">{parsed.invalid.length}</div>
                    <div className="text-[7px] uppercase tracking-wider text-white/30">
                      Inválidas
                    </div>
                  </div>
                  {kind === "verba" && (
                    <div>
                      <div className="font-mono text-lg text-[#39FF14]">
                        {brl(
                          parsed.valid.reduce(
                            (total, row) =>
                              total +
                              Number(row.verba_cury || 0) +
                              Number(row.verba_sup || 0) +
                              Number(row.verba_gerente || 0),
                            0,
                          ),
                        )}
                      </div>
                      <div className="text-[7px] uppercase tracking-wider text-white/30">
                        Verba total
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {parsed.invalid.length > 0 && (
                <div className="mb-3 max-h-28 overflow-y-auto border border-red-500/25 bg-red-500/5 p-2 text-[9px] text-red-200/80">
                  {parsed.invalid.slice(0, 30).map((item) => (
                    <div key={item.linha}>
                      Linha {item.linha}: {item.reason}
                    </div>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto border border-white/10">
                <div className="grid min-w-[900px] grid-cols-[55px_1fr_1fr_1fr_80px_80px_1fr] bg-white/[0.04] px-3 py-2 text-[8px] font-bold uppercase tracking-wider text-white/35">
                  <span>Linha</span>
                  <span>Diretor</span>
                  <span>SUP</span>
                  <span>Gerente</span>
                  <span>Mês</span>
                  <span>Ano</span>
                  <span>{kind === "vendas" ? "Metas / plantão" : "Verbas"}</span>
                </div>
                {parsed.valid.slice(0, 12).map((row) => (
                  <div
                    key={row.linha}
                    className="grid min-w-[900px] grid-cols-[55px_1fr_1fr_1fr_80px_80px_1fr] border-t border-white/[0.06] px-3 py-2 text-[9px] text-white/60"
                  >
                    <span>{row.linha}</span>
                    <span className="truncate">{row.diretor}</span>
                    <span className="truncate">{row.sup}</span>
                    <span className="truncate">{row.gerente}</span>
                    <span>{String(row.mes).padStart(2, "0")}</span>
                    <span>{row.ano}</span>
                    <span className="truncate">
                      {row.tipo === "vendas"
                        ? `${row.meta_gerente} / ${row.meta_sup} · ${row.plantao}`
                        : `${brl(row.verba_cury || 0)} · ${brl(row.verba_sup || 0)} · ${brl(row.verba_gerente || 0)}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {rawRows.length > 0 && (
          <DialogFooter className="border-t border-white/10 pt-4">
            <div className="mr-auto text-[8px] uppercase tracking-wider text-white/30">
              {progress
                ? `Processando lote ${progress.current} de ${progress.total}`
                : "Importação idempotente: linhas repetidas serão ignoradas"}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={importing}
              className="rounded-none border-white/20 bg-transparent text-white/60"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={importRows}
              disabled={
                importing ||
                loadingLinks ||
                Boolean(missingFields.length) ||
                Boolean(parsed.invalid.length) ||
                Boolean(unresolved) ||
                !parsed.valid.length
              }
              className="rounded-none bg-[#39FF14] text-[10px] font-black uppercase tracking-widest text-black hover:bg-[#39FF14]/80"
            >
              {importing ? "Importando..." : `Importar ${parsed.valid.length} linha(s)`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
