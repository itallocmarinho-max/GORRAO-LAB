import { useCallback, useMemo, useState } from "react";
import type { CellValue } from "exceljs";
import { Link2, Trash2, Upload } from "lucide-react";
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
  verbaHistoricoImport,
  verbaHistoricoVinculoDelete,
  verbaHistoricoVinculoUpsert,
  verbaHistoricoVinculosList,
} from "@/functions/verba-historico.functions";
import { brl } from "@/lib/format";

type OrigemTipo = "superintendente" | "destino";
type DestinoTipo = "diretor" | "superintendente" | "gerente";
type Campo = "mes" | "sup" | "destino" | "descricao" | "valor" | "data" | "ano";

type SavedLink = {
  id: string;
  origem_tipo: OrigemTipo;
  alias: string;
  alias_normalizado: string;
  contexto_alias: string;
  contexto_normalizado: string;
  destino_tipo: DestinoTipo;
  profile_id: string | null;
  gerente_id: string | null;
};

type ImportRow = {
  linha: number;
  mes: number;
  ano: number;
  sup: string;
  destino: string;
  descricao: string | null;
  valor: number;
  data: string;
  ocorrencia?: number;
};

type TargetOption = {
  value: string;
  type: DestinoTipo;
  id: string;
  label: string;
};

const FIELDS: Array<{ key: Campo; label: string; required: boolean; aliases: string[] }> = [
  {
    key: "mes",
    label: "Mês",
    required: true,
    aliases: ["mes", "mes referencia", "mes_referencia"],
  },
  { key: "sup", label: "SUP", required: true, aliases: ["sup", "superintendente"] },
  {
    key: "destino",
    label: "Destino",
    required: true,
    aliases: ["destino", "recebedor", "nome destino"],
  },
  {
    key: "descricao",
    label: "Descrição",
    required: false,
    aliases: ["descricao", "descrição", "observacao", "observação"],
  },
  { key: "valor", label: "Valor", required: true, aliases: ["valor", "valor total"] },
  {
    key: "data",
    label: "Data",
    required: true,
    aliases: ["data", "data pagamento", "data lancamento"],
  },
  {
    key: "ano",
    label: "Ano",
    required: true,
    aliases: ["ano", "ano referencia", "ano_referencia"],
  },
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
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
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

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let text = String(value ?? "")
    .trim()
    .replace(/[^0-9,.-]/g, "");
  if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
  else if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isoDate(value: unknown): string | null {
  let year: number;
  let month: number;
  let day: number;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    year = value.getFullYear();
    month = value.getMonth() + 1;
    day = value.getDate();
  } else if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    year = date.getUTCFullYear();
    month = date.getUTCMonth() + 1;
    day = date.getUTCDate();
  } else {
    const text = String(value ?? "").trim();
    const br = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (br) {
      year = Number(br[3]);
      month = Number(br[2]);
      day = Number(br[1]);
    } else if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.toISOString();
}

function targetValue(link: SavedLink): string {
  return `${link.destino_tipo}:${link.destino_tipo === "gerente" ? link.gerente_id : link.profile_id}`;
}

function decodeTarget(value: string): { destino_tipo: DestinoTipo; target_id: string } | null {
  const [type, id] = value.split(":");
  if (!id || !["diretor", "superintendente", "gerente"].includes(type)) return null;
  return { destino_tipo: type as DestinoTipo, target_id: id };
}

export function VerbaCuryHistorico({
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
  const [importOpen, setImportOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<Campo, string>>>({});
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [categoria, setCategoria] = useState<"agilitas" | "marketing">("agilitas");
  const [supSelections, setSupSelections] = useState<Record<string, string>>({});
  const [destinationSelections, setDestinationSelections] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [manualOrigin, setManualOrigin] = useState<OrigemTipo>("superintendente");
  const [manualAlias, setManualAlias] = useState("");
  const [manualContext, setManualContext] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  const targetOptions = useMemo<TargetOption[]>(() => {
    const supById = new Map(superintendentes.map((sup) => [sup.id, sup]));
    return [
      ...diretores.map((item) => ({
        value: `diretor:${item.id}`,
        type: "diretor" as const,
        id: item.id,
        label: `DIRETOR — ${item.nome}`,
      })),
      ...superintendentes.map((item) => ({
        value: `superintendente:${item.id}`,
        type: "superintendente" as const,
        id: item.id,
        label: `SUP — ${item.nome}`,
      })),
      ...gerentes.map((item) => ({
        value: `gerente:${item.id}`,
        type: "gerente" as const,
        id: item.id,
        label: `GERENTE — ${item.nome} · ${supById.get(item.superintendente_id)?.nome || "SEM SUP"}`,
      })),
    ].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [diretores, superintendentes, gerentes]);

  const targetLabel = useMemo(
    () => new Map(targetOptions.map((option) => [option.value, option.label])),
    [targetOptions],
  );

  const loadLinks = useCallback(async () => {
    if (!token) return;
    setLoadingLinks(true);
    try {
      const result = await verbaHistoricoVinculosList({ data: { token } });
      setSavedLinks((result.rows ?? []) as SavedLink[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar vínculos");
    } finally {
      setLoadingLinks(false);
    }
  }, [token]);

  const savedMap = useMemo(
    () =>
      new Map(
        savedLinks.map((link) => [
          `${link.origem_tipo}:${link.alias_normalizado}:${link.contexto_normalizado || ""}`,
          targetValue(link),
        ]),
      ),
    [savedLinks],
  );

  const destinationValue = (key: string, item: { alias: string; supAlias: string }) => {
    const selected = destinationSelections[key];
    if (selected) return selected;
    const contextual = savedMap.get(`destino:${normalize(item.alias)}:${normalize(item.supAlias)}`);
    if (contextual) return contextual;

    // Vínculos antigos não tinham o SUP como contexto. Eles continuam válidos para
    // diretor/SUP, mas gerente só pode ser reaproveitado se pertencer ao SUP da linha.
    const legacy = savedMap.get(`destino:${normalize(item.alias)}:`);
    const decodedLegacy = legacy ? decodeTarget(legacy) : null;
    if (decodedLegacy?.destino_tipo !== "gerente") return legacy || "";
    const supTarget =
      supSelections[normalize(item.supAlias)] ||
      savedMap.get(`superintendente:${normalize(item.supAlias)}:`);
    const decodedSup = supTarget ? decodeTarget(supTarget) : null;
    const manager = gerentes.find((candidate) => candidate.id === decodedLegacy.target_id);
    return decodedSup?.destino_tipo === "superintendente" &&
      manager?.superintendente_id === decodedSup.target_id
      ? legacy || ""
      : "";
  };

  const parsed = useMemo(() => {
    const valid: ImportRow[] = [];
    const invalid: Array<{ linha: number; reason: string }> = [];
    if (!rawRows.length) return { valid, invalid };
    rawRows.forEach((row, index) => {
      const line = index + 2;
      const month = parseMonth(mapping.mes ? row[mapping.mes] : null);
      const year = Number(mapping.ano ? row[mapping.ano] : 0);
      const sup = String(mapping.sup ? (row[mapping.sup] ?? "") : "").trim();
      const destination = String(mapping.destino ? (row[mapping.destino] ?? "") : "").trim();
      const value = parseMoney(mapping.valor ? row[mapping.valor] : null);
      const date = isoDate(mapping.data ? row[mapping.data] : null);
      const description = mapping.descricao
        ? String(row[mapping.descricao] ?? "").trim() || null
        : null;
      const problems: string[] = [];
      if (month < 1 || month > 12) problems.push("mês inválido");
      if (!Number.isInteger(year) || year < 2000 || year > 2100) problems.push("ano inválido");
      if (!sup) problems.push("SUP vazio");
      if (!destination) problems.push("destino vazio");
      if (!Number.isFinite(value) || value < 0) problems.push("valor inválido");
      if (!date) problems.push("data inválida");
      if (problems.length) invalid.push({ linha: line, reason: problems.join(", ") });
      else
        valid.push({
          linha: line,
          mes: month,
          ano: year,
          sup,
          destino: destination,
          descricao: description,
          valor: value,
          data: date!,
        });
    });
    return { valid, invalid };
  }, [mapping, rawRows]);

  const uniqueSups = useMemo(
    () =>
      Array.from(new Map(parsed.valid.map((row) => [normalize(row.sup), row.sup])).entries()).sort(
        (a, b) => a[1].localeCompare(b[1], "pt-BR"),
      ),
    [parsed.valid],
  );
  const uniqueDestinations = useMemo(
    () =>
      Array.from(
        new Map(
          parsed.valid.map((row) => [
            `${normalize(row.destino)}:${normalize(row.sup)}`,
            { alias: row.destino, supAlias: row.sup },
          ]),
        ).entries(),
      ).sort((a, b) =>
        `${a[1].supAlias} ${a[1].alias}`.localeCompare(`${b[1].supAlias} ${b[1].alias}`, "pt-BR"),
      ),
    [parsed.valid],
  );
  const requiredMissing = FIELDS.filter((field) => field.required && !mapping[field.key]);
  const unresolvedSups = uniqueSups.filter(
    ([key]) => !(supSelections[key] || savedMap.get(`superintendente:${key}:`)),
  ).length;
  const unresolvedDestinations = uniqueDestinations.filter(
    ([key, item]) => !destinationValue(key, item),
  ).length;
  const totalValue = parsed.valid.reduce((total, row) => total + row.valor, 0);

  const resetImport = () => {
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setFileName("");
    setFileError("");
    setCategoria("agilitas");
    setSupSelections({});
    setDestinationSelections({});
  };

  const openImport = async (open: boolean) => {
    setImportOpen(open);
    if (open) await loadLinks();
    else resetImport();
  };

  const openLinks = async (open: boolean) => {
    setLinksOpen(open);
    if (open) await loadLinks();
    else {
      setManualAlias("");
      setManualContext("");
      setManualTarget("");
    }
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
    for (const field of FIELDS) {
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
          for (let column = 1; column <= sheet.columnCount; column += 1)
            values.push(cellValue(row.getCell(column).value));
          matrix.push(values);
        });
        applyRows(matrix);
      }
    } catch (error) {
      resetImport();
      const message = error instanceof Error ? error.message : "Não foi possível ler o arquivo";
      setFileError(message);
      toast.error(message);
    }
  };

  const saveManualLink = async () => {
    const decoded = decodeTarget(manualTarget);
    if (!manualAlias.trim() || !decoded)
      return toast.error("Informe o nome da tabela e o cadastro interno");
    if (manualOrigin === "destino" && decoded.destino_tipo === "gerente" && !manualContext.trim()) {
      return toast.error("Informe também o SUP da tabela para vincular um gerente");
    }
    if (
      manualOrigin === "superintendente" &&
      decoded.destino_tipo !== "superintendente" &&
      decoded.destino_tipo !== "diretor"
    ) {
      return toast.error("O SUP da tabela deve ser vinculado a um diretor ou superintendente");
    }
    setSavingLink(true);
    try {
      await verbaHistoricoVinculoUpsert({
        data: {
          token,
          origem_tipo: manualOrigin,
          alias: manualAlias.trim(),
          contexto_alias:
            manualOrigin === "destino" && decoded.destino_tipo === "gerente"
              ? manualContext.trim()
              : "",
          destino_tipo: decoded.destino_tipo,
          target_id: decoded.target_id,
        },
      });
      toast.success("Vínculo salvo");
      setManualAlias("");
      setManualContext("");
      setManualTarget("");
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar vínculo");
    } finally {
      setSavingLink(false);
    }
  };

  const deleteLink = async (id: string) => {
    try {
      await verbaHistoricoVinculoDelete({ data: { token, id } });
      toast.success("Vínculo removido");
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover vínculo");
    }
  };

  const importRows = async () => {
    if (requiredMissing.length) return toast.error("Mapeie todas as colunas obrigatórias");
    if (!parsed.valid.length) return toast.error("Não há linhas válidas para importar");
    if (parsed.invalid.length)
      return toast.error("Corrija ou remova as linhas inválidas antes de importar");
    if (unresolvedSups || unresolvedDestinations)
      return toast.error("Vincule todos os nomes antes de importar");
    const links = [
      ...uniqueSups.map(([key, alias]) => ({
        origem_tipo: "superintendente" as const,
        alias,
        contexto_alias: "",
        value: supSelections[key] || savedMap.get(`superintendente:${key}:`)!,
      })),
      ...uniqueDestinations.map(([key, item]) => ({
        origem_tipo: "destino" as const,
        alias: item.alias,
        contexto_alias: item.supAlias,
        value: destinationValue(key, item),
      })),
    ].map(({ origem_tipo, alias, contexto_alias, value }) => ({
      origem_tipo,
      alias,
      contexto_alias,
      ...decodeTarget(value)!,
    }));
    setImporting(true);
    const chunkSize = 150;
    const occurrenceByContent = new Map<string, number>();
    const rowsWithOccurrence = parsed.valid.map((row) => {
      const content = JSON.stringify({
        mes: row.mes,
        ano: row.ano,
        sup: normalize(row.sup),
        destino: normalize(row.destino),
        descricao: row.descricao || "",
        valor: row.valor,
        data: row.data,
      });
      const occurrence = (occurrenceByContent.get(content) ?? 0) + 1;
      occurrenceByContent.set(content, occurrence);
      return { ...row, ocorrencia: occurrence };
    });
    const chunkTotal = Math.ceil(rowsWithOccurrence.length / chunkSize);
    let importedTotal = 0;
    let ignoredTotal = 0;
    try {
      for (let index = 0; index < rowsWithOccurrence.length; index += chunkSize) {
        const current = Math.floor(index / chunkSize) + 1;
        setImportProgress({ current, total: chunkTotal });
        const result = await verbaHistoricoImport({
          data: {
            token,
            categoria,
            rows: rowsWithOccurrence.slice(index, index + chunkSize),
            vinculos: links,
          },
        });
        importedTotal += result.imported;
        ignoredTotal += result.ignored;
      }
      const ignored = ignoredTotal ? ` · ${ignoredTotal} já existente(s) ignorada(s)` : "";
      toast.success(`${importedTotal} linha(s) importada(s)${ignored}`);
      setImportOpen(false);
      resetImport();
      await onImported();
    } catch (error) {
      const prefix = importedTotal
        ? `${importedTotal} linha(s) foram gravadas antes da interrupção. Pode tentar novamente. `
        : "";
      toast.error(
        prefix + (error instanceof Error ? error.message : "Erro ao importar histórico"),
        { duration: 10000 },
      );
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <>
      <Dialog open={linksOpen} onOpenChange={openLinks}>
        <DialogTrigger asChild>
          <Button variant="outline" className={cyberButton}>
            <Link2 className="mr-1 h-3.5 w-3.5" /> Vínculos
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-none border border-[#39FF14]/40 bg-black/95 text-white shadow-[0_0_45px_rgba(57,255,20,0.12)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase tracking-[0.22em] text-[#39FF14]">
              / / Vínculos do histórico
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-5 text-white/45">
            Cadastre os nomes exatamente como aparecem na tabela. Os vínculos ficam salvos para as
            próximas importações.
          </p>
          <div className="grid gap-3 border border-white/10 bg-white/[0.025] p-3 md:grid-cols-[160px_1fr_1fr_1.4fr_auto]">
            <Select
              value={manualOrigin}
              onValueChange={(value) => {
                setManualOrigin(value as OrigemTipo);
                setManualTarget("");
              }}
            >
              <SelectTrigger className={cyberInput}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="superintendente">SUP DA TABELA</SelectItem>
                <SelectItem value="destino">DESTINO DA TABELA</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={manualAlias}
              onChange={(event) => setManualAlias(event.target.value)}
              placeholder="NOME NA TABELA"
              className={cyberInput}
            />
            <Input
              value={manualContext}
              onChange={(event) => setManualContext(event.target.value)}
              placeholder={manualOrigin === "destino" ? "SUP DA TABELA" : "NÃO SE APLICA"}
              disabled={manualOrigin !== "destino"}
              className={cyberInput}
            />
            <Select value={manualTarget} onValueChange={setManualTarget}>
              <SelectTrigger className={cyberInput}>
                <SelectValue placeholder="CADASTRO INTERNO" />
              </SelectTrigger>
              <SelectContent>
                {targetOptions
                  .filter(
                    (option) =>
                      manualOrigin === "destino" ||
                      option.type === "superintendente" ||
                      option.type === "diretor",
                  )
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={saveManualLink}
              disabled={savingLink}
              className="h-9 rounded-none bg-[#39FF14] px-4 text-[10px] font-black uppercase tracking-widest text-black hover:bg-[#39FF14]/80"
            >
              {savingLink ? "Salvando" : "Salvar"}
            </Button>
          </div>
          <div className="overflow-hidden border border-white/10">
            <div className="grid grid-cols-[110px_1fr_1fr_1.4fr_40px] border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
              <span>Origem</span>
              <span>Nome na tabela</span>
              <span>SUP da época</span>
              <span>Cadastro interno</span>
              <span />
            </div>
            {loadingLinks ? (
              <div className="p-6 text-center text-[10px] uppercase tracking-widest text-white/35">
                Carregando vínculos...
              </div>
            ) : savedLinks.length === 0 ? (
              <div className="p-6 text-center text-[10px] uppercase tracking-widest text-white/35">
                Nenhum vínculo salvo
              </div>
            ) : (
              savedLinks.map((link) => (
                <div
                  key={link.id}
                  className="grid grid-cols-[110px_1fr_1fr_1.4fr_40px] items-center border-b border-white/[0.06] px-3 py-2 text-[10px] last:border-0"
                >
                  <span className="uppercase tracking-wider text-[#39FF14]/70">
                    {link.origem_tipo === "superintendente" ? "SUP" : "Destino"}
                  </span>
                  <span className="truncate text-white/75" title={link.alias}>
                    {link.alias}
                  </span>
                  <span className="truncate text-white/35" title={link.contexto_alias || ""}>
                    {link.contexto_alias || "—"}
                  </span>
                  <span
                    className="truncate text-white/45"
                    title={targetLabel.get(targetValue(link))}
                  >
                    {targetLabel.get(targetValue(link)) || "Cadastro removido"}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteLink(link.id)}
                    className="grid h-7 w-7 place-items-center text-white/30 transition hover:text-red-400"
                    aria-label={`Remover vínculo de ${link.alias}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={openImport}>
        <DialogTrigger asChild>
          <Button variant="outline" className={cyberButton}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Importar histórico
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto rounded-none border border-[#39FF14]/40 bg-black/95 text-white shadow-[0_0_55px_rgba(57,255,20,0.12)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase tracking-[0.22em] text-[#39FF14]">
              / / Importação histórica · temporário
            </DialogTitle>
          </DialogHeader>
          {!rawRows.length ? (
            <div className="space-y-4 py-3">
              <div className="border border-dashed border-[#39FF14]/35 bg-[#39FF14]/[0.025] p-8 text-center">
                <Upload className="mx-auto mb-3 h-7 w-7 text-[#39FF14]" />
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-white">
                  Selecione sua tabela
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {FIELDS.map((field) => (
                  <div
                    key={field.key}
                    className="border border-white/10 bg-white/[0.02] px-3 py-2 text-[9px] uppercase tracking-wider text-white/50"
                  >
                    {field.label}
                    {field.required && <span className="ml-1 text-[#39FF14]">*</span>}
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
                    Arquivo
                  </div>
                  <div className="mt-1 text-xs font-bold text-white">{fileName}</div>
                </div>
                <button
                  type="button"
                  onClick={resetImport}
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
                  {FIELDS.map((field) => (
                    <div key={field.key}>
                      <Label className="mb-1 block text-[9px] uppercase tracking-wider text-white/45">
                        {field.label}
                        {field.required && <span className="ml-1 text-[#39FF14]">*</span>}
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
                  <div>
                    <Label className="mb-1 block text-[9px] uppercase tracking-wider text-white/45">
                      Valor será contabilizado em
                    </Label>
                    <Select
                      value={categoria}
                      onValueChange={(value) => setCategoria(value as "agilitas" | "marketing")}
                    >
                      <SelectTrigger className={cyberInput}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agilitas">VERBA AGILITAS</SelectItem>
                        <SelectItem value="marketing">MARKETING</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {requiredMissing.length > 0 && (
                  <p className="mt-2 text-[10px] text-amber-300">
                    Mapeie: {requiredMissing.map((field) => field.label).join(", ")}.
                  </p>
                )}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#39FF14]">
                    02 · Vínculos das equipes
                  </h3>
                  <span className="text-[9px] uppercase tracking-wider text-white/35">
                    {unresolvedSups + unresolvedDestinations} pendente(s)
                  </span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="border border-white/10">
                    <div className="border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
                      SUP da tabela → Diretor ou superintendente
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {uniqueSups.map(([key, alias]) => (
                        <div
                          key={key}
                          className="grid grid-cols-[minmax(100px,0.8fr)_minmax(180px,1.2fr)] items-center gap-2 border-b border-white/[0.06] py-2 last:border-0"
                        >
                          <span className="truncate text-[10px] text-white/65" title={alias}>
                            {alias}
                          </span>
                          <Select
                            value={
                              supSelections[key] || savedMap.get(`superintendente:${key}:`) || ""
                            }
                            onValueChange={(value) =>
                              setSupSelections((current) => ({ ...current, [key]: value }))
                            }
                          >
                            <SelectTrigger className={cyberInput}>
                              <SelectValue placeholder="VINCULAR..." />
                            </SelectTrigger>
                            <SelectContent>
                              {targetOptions
                                .filter(
                                  (option) =>
                                    option.type === "superintendente" || option.type === "diretor",
                                )
                                .map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border border-white/10">
                    <div className="border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
                      Destino da tabela → Diretor, SUP ou gerente
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {uniqueDestinations.map(([key, item]) => (
                        <div
                          key={key}
                          className="grid grid-cols-[minmax(100px,0.8fr)_minmax(180px,1.2fr)] items-center gap-2 border-b border-white/[0.06] py-2 last:border-0"
                        >
                          <span
                            className="min-w-0 text-[10px] text-white/65"
                            title={`${item.alias} · SUP ${item.supAlias}`}
                          >
                            <span className="block truncate">{item.alias}</span>
                            <span className="block truncate text-[7px] uppercase tracking-wider text-white/30">
                              SUP · {item.supAlias}
                            </span>
                          </span>
                          <Select
                            value={destinationValue(key, item)}
                            onValueChange={(value) =>
                              setDestinationSelections((current) => ({ ...current, [key]: value }))
                            }
                          >
                            <SelectTrigger className={cyberInput}>
                              <SelectValue placeholder="VINCULAR..." />
                            </SelectTrigger>
                            <SelectContent>
                              {targetOptions
                                .filter((option) => {
                                  if (option.type !== "gerente") return true;
                                  const supTarget =
                                    supSelections[normalize(item.supAlias)] ||
                                    savedMap.get(`superintendente:${normalize(item.supAlias)}:`);
                                  const decodedSup = supTarget ? decodeTarget(supTarget) : null;
                                  const manager = gerentes.find(
                                    (candidate) => candidate.id === option.id,
                                  );
                                  return (
                                    decodedSup?.destino_tipo === "superintendente" &&
                                    manager?.superintendente_id === decodedSup.target_id
                                  );
                                })
                                .map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#39FF14]">
                    03 · Conferência
                  </h3>
                  <div className="flex gap-5 text-right">
                    <div>
                      <div className="text-[8px] uppercase tracking-wider text-white/35">
                        Linhas válidas
                      </div>
                      <div className="font-mono text-base font-bold text-white">
                        {parsed.valid.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase tracking-wider text-white/35">
                        Valor total
                      </div>
                      <div className="font-mono text-base font-bold text-[#39FF14]">
                        {brl(totalValue)}
                      </div>
                    </div>
                  </div>
                </div>
                {parsed.invalid.length > 0 && (
                  <div className="mb-3 border border-red-500/30 bg-red-500/5 p-3 text-[10px] text-red-300">
                    <strong>{parsed.invalid.length} linha(s) inválida(s):</strong>{" "}
                    {parsed.invalid
                      .slice(0, 8)
                      .map((item) => `linha ${item.linha} (${item.reason})`)
                      .join("; ")}
                    {parsed.invalid.length > 8 ? "..." : ""}
                  </div>
                )}
                <div className="overflow-x-auto border border-white/10">
                  <table className="w-full min-w-[820px] text-left text-[10px]">
                    <thead className="border-b border-white/10 bg-white/[0.035] uppercase tracking-wider text-white/35">
                      <tr>
                        <th className="p-2">Linha</th>
                        <th className="p-2">Mês/Ano</th>
                        <th className="p-2">SUP</th>
                        <th className="p-2">Destino</th>
                        <th className="p-2">Descrição</th>
                        <th className="p-2">Data</th>
                        <th className="p-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.valid.slice(0, 8).map((row) => (
                        <tr key={row.linha} className="border-b border-white/[0.06] last:border-0">
                          <td className="p-2 text-white/30">{row.linha}</td>
                          <td className="p-2 text-white/55">
                            {String(row.mes).padStart(2, "0")}/{row.ano}
                          </td>
                          <td className="p-2 text-white/65">{row.sup}</td>
                          <td className="p-2 text-white/65">{row.destino}</td>
                          <td className="max-w-[260px] truncate p-2 text-white/40">
                            {row.descricao || "—"}
                          </td>
                          <td className="p-2 text-white/45">
                            {new Date(row.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                          </td>
                          <td className="p-2 text-right font-mono text-[#39FF14]">
                            {brl(row.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.valid.length > 8 && (
                  <div className="mt-2 text-right text-[8px] uppercase tracking-wider text-white/25">
                    Prévia de 8 entre {parsed.valid.length} linhas
                  </div>
                )}
              </section>
            </div>
          )}
          <DialogFooter className="border-t border-white/10 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importing}
              className="rounded-none border-white/15 bg-transparent text-xs text-white/50 hover:bg-white/5 hover:text-white"
            >
              Cancelar
            </Button>
            {rawRows.length > 0 && (
              <Button
                type="button"
                onClick={importRows}
                disabled={
                  importing ||
                  requiredMissing.length > 0 ||
                  parsed.invalid.length > 0 ||
                  unresolvedSups > 0 ||
                  unresolvedDestinations > 0
                }
                className="rounded-none bg-[#39FF14] text-xs font-black uppercase tracking-widest text-black hover:bg-[#39FF14]/80 disabled:bg-white/10 disabled:text-white/25"
              >
                {importing
                  ? importProgress
                    ? `Importando lote ${importProgress.current}/${importProgress.total}`
                    : "Preparando importação..."
                  : `Importar ${parsed.valid.length} linha(s)`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
