import { useCallback, useEffect, useMemo, useState } from "react";
import type { CellValue } from "exceljs";
import { Link2, Plus, Upload, UserPlus } from "lucide-react";
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
  contabilHistoricoImport,
  contabilPessoaCreate,
  contabilVinculosList,
} from "@/functions/contabil.functions";

type Tipo = "diretor" | "superintendente" | "gerente";
type Target = { kind: "profile" | "gerente" | "pessoa"; id: string };
type Campo =
  | "pv"
  | "empreendimento"
  | "torre"
  | "unidade"
  | "corretor"
  | "gerente"
  | "sup"
  | "diretor"
  | "vgv"
  | "tipo_venda"
  | "quantidade"
  | "mes"
  | "trimestre"
  | "ano"
  | "canal"
  | "cidade"
  | "regiao"
  | "plantao";
type Pessoa = {
  id: string;
  tipo: Tipo;
  nome: string;
  parent_profile_id: string | null;
  parent_pessoa_id: string | null;
};

type UniqueLink = { alias: string; context: string };
type DisplayLink = { alias: string; contexts: string[] };
type Link = {
  tipo: Tipo;
  alias: string;
  alias_normalizado: string;
  contexto_alias: string;
  contexto_normalizado: string;
  profile_id: string | null;
  gerente_id: string | null;
  pessoa_id: string | null;
};
type Parsed = {
  linha: number;
  pv: string;
  empreendimento: string;
  torre: string;
  unidade: string;
  corretor: string;
  gerente: string;
  sup: string;
  diretor: string;
  vgv: number;
  tipo_venda: string;
  quantidade: number;
  mes: number;
  trimestre: string;
  ano: number;
  canal: string;
  cidade: string;
  regiao: string;
  plantao: string;
  ocorrencia?: number;
};

const FIELDS: Array<{ key: Campo; label: string; aliases: string[]; numeric?: boolean }> = [
  { key: "pv", label: "PV", aliases: ["pv", "pasta", "proposta"] },
  { key: "empreendimento", label: "Empreendimento", aliases: ["empreendimento", "produto"] },
  { key: "torre", label: "Torre", aliases: ["torre", "bloco"] },
  { key: "unidade", label: "Unidade", aliases: ["unidade", "apto", "apartamento"] },
  { key: "corretor", label: "Corretor", aliases: ["corretor"] },
  { key: "gerente", label: "Gerente", aliases: ["gerente"] },
  { key: "sup", label: "SUP", aliases: ["sup", "superintendente"] },
  { key: "diretor", label: "Diretor", aliases: ["diretor"] },
  { key: "vgv", label: "VGV", aliases: ["vgv", "valor vgv"], numeric: true },
  { key: "tipo_venda", label: "Tipo de venda", aliases: ["tipo de venda", "tipo venda"] },
  { key: "quantidade", label: "Quantidade", aliases: ["quantidade", "qtd"], numeric: true },
  { key: "mes", label: "Mês", aliases: ["mes", "mês"] },
  { key: "trimestre", label: "Trimestre", aliases: ["trimestre", "tri"] },
  { key: "ano", label: "Ano", aliases: ["ano"], numeric: true },
  { key: "canal", label: "Canal", aliases: ["canal"] },
  { key: "cidade", label: "Cidade", aliases: ["cidade"] },
  { key: "regiao", label: "Região", aliases: ["regiao", "região", "regiao da cidade de sp"] },
  { key: "plantao", label: "Plantão", aliases: ["plantao", "plantão"] },
];

const button =
  "h-9 rounded-none border border-[#39FF14]/55 bg-black/60 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14] hover:bg-[#39FF14]/10";
const input =
  "h-9 rounded-none border-[#39FF14]/30 bg-black/70 text-xs text-white focus-visible:border-[#39FF14] focus-visible:ring-0";

function norm(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function linkKey(tipo: Tipo, alias: string, context = "") {
  return `${tipo}:${norm(alias)}:${tipo === "diretor" ? "" : norm(context)}`;
}
function encode(target: Target) {
  return `${target.kind}:${target.id}`;
}
function decode(value: string): Target | null {
  const [kind, id] = value.split(":");
  return id && ["profile", "gerente", "pessoa"].includes(kind)
    ? { kind: kind as Target["kind"], id }
    : null;
}
function targetOf(link: Link): string {
  return link.profile_id
    ? `profile:${link.profile_id}`
    : link.gerente_id
      ? `gerente:${link.gerente_id}`
      : link.pessoa_id
        ? `pessoa:${link.pessoa_id}`
        : "";
}
function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  let text = String(value ?? "")
    .trim()
    .replace(/[^0-9,.-]/g, "");
  if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
  else if (text.includes(",")) text = text.replace(",", ".");
  return Number(text);
}
function monthValue(value: unknown) {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
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
  const text = norm(value);
  const i = months.findIndex((m) => m.startsWith(text) || text.startsWith(m.slice(0, 3)));
  return i + 1;
}
function cell(value: CellValue): unknown {
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    if ("result" in value) return value.result;
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return value;
}
function csv(text: string) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (first.match(/;/g)?.length || 0) > (first.match(/,/g)?.length || 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  row.push(value);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export function ContabilHistorico({
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
  const [open, setOpen] = useState(false),
    [fileName, setFileName] = useState(""),
    [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Partial<Record<Campo, string>>>({});
  const [links, setLinks] = useState<Link[]>([]),
    [known, setKnown] = useState<Link[]>([]),
    [people, setPeople] = useState<Pessoa[]>([]),
    [selected, setSelected] = useState<Record<string, string>>({});
  const [create, setCreate] = useState<{ tipo: Tipo; alias: string; context: string } | null>(null),
    [newName, setNewName] = useState(""),
    [creating, setCreating] = useState(false);

  const loadLinks = useCallback(async () => {
    const result = await contabilVinculosList({ data: { token } });
    setLinks(result.rows as Link[]);
    setPeople(result.pessoas as Pessoa[]);
    setKnown(
      (result.known as Link[]).map((item) => ({
        ...item,
        contexto_alias: "",
        contexto_normalizado: "",
        pessoa_id: null,
      })),
    );
  }, [token]);
  useEffect(() => {
    if (open) void loadLinks().catch((e) => toast.error(e.message));
  }, [open, loadLinks]);

  const apply = (matrix: unknown[][]) => {
    const hs = (matrix[0] || []).map((v, i) => String(v ?? "").trim() || `COLUNA ${i + 1}`);
    const rows = matrix
      .slice(1)
      .filter((r) => r.some((v) => String(v ?? "").trim()))
      .map((r) => Object.fromEntries(hs.map((h, i) => [h, r[i] ?? null])));
    if (!rows.length) throw new Error("A tabela não possui dados");
    const guessed: Partial<Record<Campo, string>> = {};
    FIELDS.forEach((field) => {
      const found = hs.find((h) => field.aliases.some((a) => norm(a) === norm(h)));
      if (found) guessed[field.key] = found;
    });
    setHeaders(hs);
    setRaw(rows);
    setMapping(guessed);
  };
  const read = async (file: File) => {
    setFileName(file.name);
    try {
      if (file.name.toLowerCase().endsWith(".csv")) apply(csv(await file.text()));
      else {
        const { default: ExcelJS } = await import("exceljs");
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(await file.arrayBuffer());
        const sheet = book.worksheets[0];
        if (!sheet) throw new Error("A planilha não possui abas");
        const matrix: unknown[][] = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const values: unknown[] = [];
          for (let i = 1; i <= sheet.columnCount; i++) values.push(cell(row.getCell(i).value));
          matrix.push(values);
        });
        apply(matrix);
      }
    } catch (e) {
      setRaw([]);
      toast.error(e instanceof Error ? e.message : "Erro ao ler arquivo");
    }
  };

  const parsed = useMemo(() => {
    const valid: Parsed[] = [],
      errors: string[] = [];
    raw.forEach((row, index) => {
      const get = (key: Campo) => (mapping[key] ? row[mapping[key]!] : null);
      const item: Parsed = {
        linha: index + 2,
        pv: String(get("pv") ?? "").trim(),
        empreendimento: String(get("empreendimento") ?? "").trim(),
        torre: String(get("torre") ?? "").trim(),
        unidade: String(get("unidade") ?? "").trim(),
        corretor: String(get("corretor") ?? "").trim(),
        gerente: String(get("gerente") ?? "").trim(),
        sup: String(get("sup") ?? "").trim(),
        diretor: String(get("diretor") ?? "").trim(),
        vgv: numberValue(get("vgv")),
        tipo_venda: String(get("tipo_venda") ?? "").trim(),
        quantidade: numberValue(get("quantidade")),
        mes: monthValue(get("mes")),
        trimestre: String(get("trimestre") ?? "").trim(),
        ano: Number(get("ano")),
        canal: String(get("canal") ?? "").trim(),
        cidade: String(get("cidade") ?? "").trim(),
        regiao: String(get("regiao") ?? "").trim(),
        plantao: String(get("plantao") ?? "").trim(),
      };
      const problem: string[] = [];
      if (!item.pv) problem.push("PV");
      if (!item.diretor) problem.push("diretor");
      if (!item.sup) problem.push("SUP");
      if (!item.gerente) problem.push("gerente");
      if (!Number.isFinite(item.vgv) || item.vgv < 0) problem.push("VGV");
      if (!Number.isFinite(item.quantidade)) problem.push("quantidade");
      if (item.mes < 1 || item.mes > 12) problem.push("mês");
      if (!Number.isInteger(item.ano) || item.ano < 2000) problem.push("ano");
      if (problem.length) errors.push(`Linha ${item.linha}: ${problem.join(", ")}`);
      else valid.push(item);
    });
    return { valid, errors };
  }, [raw, mapping]);
  const uniques = useMemo(
    () => ({
      diretor: [
        ...new Map(
          parsed.valid.map((r) => [norm(r.diretor), { alias: r.diretor, context: "" }]),
        ).values(),
      ],
      superintendente: [
        ...new Map(
          parsed.valid.map((r) => [
            linkKey("superintendente", r.sup, r.diretor),
            { alias: r.sup, context: r.diretor },
          ]),
        ).values(),
      ],
      gerente: [
        ...new Map(
          parsed.valid.map((r) => [
            linkKey("gerente", r.gerente, r.sup),
            { alias: r.gerente, context: r.sup },
          ]),
        ).values(),
      ],
    }),
    [parsed.valid],
  );
  const displayUniques = useMemo(
    () => ({
      diretor: uniques.diretor.map((item) => ({ alias: item.alias, contexts: [item.context] })),
      superintendente: uniques.superintendente.map((item) => ({
        alias: item.alias,
        contexts: [item.context],
      })),
      gerente: [
        ...new Map(
          uniques.gerente.map((item) => {
            const normalized = norm(item.alias);
            return [
              normalized,
              {
                alias: item.alias,
                contexts: uniques.gerente
                  .filter((candidate) => norm(candidate.alias) === normalized)
                  .map((candidate) => candidate.context)
                  .filter((context, index, all) => all.indexOf(context) === index)
                  .sort((a, b) => a.localeCompare(b, "pt-BR")),
              },
            ];
          }),
        ).values(),
      ],
    }),
    [uniques],
  );
  const savedMap = useMemo(
    () => new Map(links.map((l) => [linkKey(l.tipo, l.alias, l.contexto_alias), targetOf(l)])),
    [links],
  );
  const knownMap = useMemo(
    () => new Map(known.map((l) => [`${l.tipo}:${l.alias_normalizado}`, targetOf(l)])),
    [known],
  );
  const parentOf = (value: string) => {
    const target = decode(value);
    if (!target) return "";
    if (target.kind === "profile") {
      const sup = superintendentes.find((item) => item.id === target.id);
      return sup?.diretor_id ? `profile:${sup.diretor_id}` : "";
    }
    if (target.kind === "gerente") {
      const manager = gerentes.find((item) => item.id === target.id);
      return manager?.superintendente_id ? `profile:${manager.superintendente_id}` : "";
    }
    const person = people.find((item) => item.id === target.id);
    return person?.parent_profile_id
      ? `profile:${person.parent_profile_id}`
      : person?.parent_pessoa_id
        ? `pessoa:${person.parent_pessoa_id}`
        : "";
  };
  const nameOf = (value: string) => {
    const target = decode(value);
    if (!target) return "";
    if (target.kind === "profile") {
      return [...diretores, ...superintendentes].find((item) => item.id === target.id)?.nome || "";
    }
    if (target.kind === "gerente") {
      return gerentes.find((item) => item.id === target.id)?.nome || "";
    }
    return people.find((item) => item.id === target.id)?.nome || "";
  };
  const directorContextForSup = (supAlias: string) =>
    parsed.valid.find((row) => norm(row.sup) === norm(supAlias))?.diretor || "";
  const expectedParent = (tipo: Tipo, context: string) =>
    tipo === "superintendente"
      ? current("diretor", context)
      : tipo === "gerente"
        ? current("superintendente", context, directorContextForSup(context))
        : "";
  function current(tipo: Tipo, alias: string, context = "", parentContext = "") {
    const candidates = [
      selected[linkKey(tipo, alias, context)],
      savedMap.get(linkKey(tipo, alias, context)),
      knownMap.get(`${tipo}:${norm(alias)}`),
      exact(tipo, alias, context),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (tipo === "diretor") return candidate;
      const expected = expectedParent(tipo, parentContext || context);
      if (parentOf(candidate) === expected) return candidate;
      const canonicalName = norm(nameOf(candidate));
      if (canonicalName) {
        const contextual = targetByNameAndParent(tipo, canonicalName, expected);
        if (contextual) return contextual;
      }
    }
    return "";
  }
  function targetByNameAndParent(tipo: Tipo, normalizedName: string, expected: string) {
    if (tipo === "superintendente") {
      const profile = superintendentes.find(
        (item) => norm(item.nome) === normalizedName && parentOf(`profile:${item.id}`) === expected,
      );
      const historical = people.find(
        (item) =>
          item.tipo === tipo &&
          norm(item.nome) === normalizedName &&
          parentOf(`pessoa:${item.id}`) === expected,
      );
      return profile ? `profile:${profile.id}` : historical ? `pessoa:${historical.id}` : "";
    }
    if (tipo === "gerente") {
      const manager = gerentes.find(
        (item) => norm(item.nome) === normalizedName && parentOf(`gerente:${item.id}`) === expected,
      );
      const historical = people.find(
        (item) =>
          item.tipo === tipo &&
          norm(item.nome) === normalizedName &&
          parentOf(`pessoa:${item.id}`) === expected,
      );
      return manager ? `gerente:${manager.id}` : historical ? `pessoa:${historical.id}` : "";
    }
    return "";
  }
  function exact(tipo: Tipo, alias: string, context = "") {
    if (tipo === "diretor") {
      const p = diretores.find((x) => norm(x.nome) === norm(alias));
      const h = people.find((x) => x.tipo === tipo && norm(x.nome) === norm(alias));
      return p ? `profile:${p.id}` : h ? `pessoa:${h.id}` : "";
    }
    return targetByNameAndParent(tipo, norm(alias), expectedParent(tipo, context));
  }
  const options = (tipo: Tipo, context = "") =>
    [
      ...(tipo === "diretor"
        ? diretores.map((p) => ({ value: `profile:${p.id}`, label: p.nome }))
        : tipo === "superintendente"
          ? superintendentes.map((p) => ({ value: `profile:${p.id}`, label: p.nome }))
          : gerentes.map((p) => ({ value: `gerente:${p.id}`, label: p.nome }))),
      ...people
        .filter((p) => p.tipo === tipo)
        .map((p) => ({ value: `pessoa:${p.id}`, label: `${p.nome} · HISTÓRICO` })),
    ]
      .filter(
        (option) => tipo === "diretor" || parentOf(option.value) === expectedParent(tipo, context),
      )
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const managerNameOptions = useMemo(
    () =>
      [
        ...new Map(
          [
            ...gerentes.map((item) => item.nome),
            ...people.filter((item) => item.tipo === "gerente").map((item) => item.nome),
          ].map((name) => [norm(name), { value: `name:${norm(name)}`, label: name }] as const),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [gerentes, people],
  );
  const groupValue = (tipo: Tipo, item: DisplayLink) => {
    if (tipo !== "gerente") return current(tipo, item.alias, item.contexts[0]);
    const names = item.contexts
      .map((context) => norm(nameOf(current(tipo, item.alias, context))))
      .filter(Boolean);
    return names.length && names.every((name) => name === names[0]) ? `name:${names[0]}` : "";
  };
  const setGroupValue = (tipo: Tipo, item: DisplayLink, value: string) => {
    setSelected((state) => {
      const next = { ...state };
      for (const context of item.contexts) {
        const target =
          tipo === "gerente"
            ? targetByNameAndParent(
                tipo,
                value.replace(/^name:/, ""),
                expectedParent(tipo, context),
              )
            : value;
        const selectionKey = linkKey(tipo, item.alias, context);
        if (target) next[selectionKey] = target;
        else delete next[selectionKey];
      }
      return next;
    });
  };
  const isValidated = (tipo: Tipo, item: UniqueLink) =>
    Boolean(
      selected[linkKey(tipo, item.alias, item.context)] ||
      savedMap.get(linkKey(tipo, item.alias, item.context)),
    );
  const displayEntries = Object.entries(displayUniques) as Array<[Tipo, DisplayLink[]]>;
  const itemIsValidated = (tipo: Tipo, item: DisplayLink) =>
    item.contexts.every((context) => isValidated(tipo, { alias: item.alias, context }));
  const itemHasSuggestion = (tipo: Tipo, item: DisplayLink) =>
    item.contexts.every((context) => Boolean(current(tipo, item.alias, context)));
  const unresolved = (
    Object.entries(uniques) as Array<[Tipo, Array<{ alias: string; context: string }>]>
  ).flatMap(([tipo, values]) => values.filter((v) => !current(tipo, v.alias, v.context))).length;
  const pendingItems = displayEntries.flatMap(([tipo, values]) =>
    values
      .filter((item) => !itemIsValidated(tipo, item))
      .map((item) => ({ tipo, ...item, hasSuggestion: itemHasSuggestion(tipo, item) })),
  );
  const pendingValidation = pendingItems.length;
  const pendingNames = pendingItems.map((item) => item.alias);

  const validateAll = () => {
    let accepted = 0;
    let missing = 0;
    setSelected((state) => {
      const next = { ...state };
      for (const [tipo, values] of displayEntries) {
        for (const item of values) {
          if (itemIsValidated(tipo, item)) continue;
          const suggestions = item.contexts.map((context) => ({
            context,
            value: current(tipo, item.alias, context),
          }));
          if (suggestions.every((suggestion) => Boolean(suggestion.value))) {
            for (const suggestion of suggestions) {
              next[linkKey(tipo, item.alias, suggestion.context)] = suggestion.value;
            }
            accepted += 1;
          } else missing += 1;
        }
      }
      return next;
    });
    if (accepted) toast.success(`${accepted} vínculo(s) sugerido(s) validado(s)`);
    if (missing) toast.warning(`${missing} vínculo(s) divergente(s) precisam de ajuste manual`);
  };

  const createPerson = async () => {
    if (!create || !newName.trim()) return;
    let parent: Target | null = null;
    if (create.tipo !== "diretor") {
      parent = decode(expectedParent(create.tipo, create.context));
      if (!parent) return toast.error("Vincule primeiro a hierarquia superior");
    }
    setCreating(true);
    try {
      const result = await contabilPessoaCreate({
        data: {
          token,
          tipo: create.tipo,
          nome: newName.trim(),
          alias: create.alias,
          contexto_alias: create.context,
          parent,
        },
      });
      const person = result.pessoa as Pessoa;
      setPeople((items) => [...items.filter((x) => x.id !== person.id), person]);
      setSelected((s) => ({
        ...s,
        [linkKey(create.tipo, create.alias, create.context)]: `pessoa:${person.id}`,
      }));
      toast.success(
        result.created
          ? "Cadastro histórico criado e vinculado"
          : "Cadastro histórico existente vinculado",
      );
      setCreate(null);
      await loadLinks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar cadastro");
    } finally {
      setCreating(false);
    }
  };
  const importRows = async () => {
    const missing = FIELDS.filter((f) => !mapping[f.key]);
    if (missing.length) return toast.error(`Mapeie: ${missing.map((f) => f.label).join(", ")}`);
    if (parsed.errors.length)
      return toast.error(`${parsed.errors.length} linha(s) inválida(s). ${parsed.errors[0]}`);
    if (!parsed.valid.length) return toast.error("Nenhuma linha válida");
    if (pendingValidation)
      return toast.error(
        `Valide ${pendingValidation === 1 ? "o vínculo" : `os ${pendingValidation} vínculos`}: ${pendingNames.join(", ")}`,
        { duration: 12000 },
      );
    if (unresolved) return toast.error(`Existem ${unresolved} vínculo(s) pendente(s)`);
    const vinculos = (
      Object.entries(uniques) as Array<[Tipo, Array<{ alias: string; context: string }>]>
    ).flatMap(([tipo, values]) =>
      values.map((v) => ({
        tipo,
        alias: v.alias,
        contexto_alias: v.context,
        target: decode(current(tipo, v.alias, v.context))!,
      })),
    );
    const occurrences = new Map<string, number>();
    const rows = parsed.valid.map((r) => {
      const { linha: _linha, ...canonical } = r;
      const content = JSON.stringify(canonical);
      const ocorrencia = (occurrences.get(content) || 0) + 1;
      occurrences.set(content, ocorrencia);
      return { ...r, ocorrencia };
    });
    setBusy(true);
    let imported = 0,
      ignored = 0;
    try {
      for (let i = 0; i < rows.length; i += 150) {
        const result = await contabilHistoricoImport({
          data: { token, rows: rows.slice(i, i + 150), vinculos },
        });
        imported += result.imported;
        ignored += result.ignored;
      }
      toast.success(
        `${imported} registro(s) importado(s)${ignored ? ` · ${ignored} já existente(s)` : ""}`,
      );
      setOpen(false);
      setRaw([]);
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na importação", { duration: 10000 });
    } finally {
      setBusy(false);
    }
  };

  const LinkRows = ({ tipo, values }: { tipo: Tipo; values: DisplayLink[] }) => (
    <section>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#39FF14]">
        {tipo === "diretor"
          ? "Diretores"
          : tipo === "superintendente"
            ? "Superintendentes"
            : "Gerentes"}
      </h3>
      <div className="divide-y divide-white/[.06] border border-white/10">
        {values
          .sort((a, b) => a.alias.localeCompare(b.alias, "pt-BR"))
          .map((item) => {
            const validated = itemIsValidated(tipo, item);
            const suggested = itemHasSuggestion(tipo, item);
            return (
              <div
                key={`${tipo}:${norm(item.alias)}`}
                className={`grid grid-cols-[minmax(120px,.8fr)_minmax(200px,1.2fr)_38px] items-center gap-2 border-l-2 bg-black/35 p-2 ${
                  validated
                    ? "border-l-[#39FF14]"
                    : suggested
                      ? "border-l-amber-400"
                      : "border-l-red-400"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[10px] text-white/70">{item.alias}</div>
                  {item.contexts.some(Boolean) && (
                    <div className="truncate text-[7px] uppercase tracking-wider text-white/30">
                      {tipo === "gerente" && item.contexts.length > 1
                        ? "SUPS"
                        : tipo === "gerente"
                          ? "SUP"
                          : "DIRETOR"}{" "}
                      · {item.contexts.filter(Boolean).join(" / ")}
                    </div>
                  )}
                  <div
                    className={`mt-1 text-[7px] font-bold uppercase tracking-wider ${
                      validated ? "text-[#39FF14]" : suggested ? "text-amber-400" : "text-red-400"
                    }`}
                  >
                    {validated ? "Validado" : suggested ? "Sugestão · validar" : "Revisão manual"}
                  </div>
                </div>
                <Select
                  value={groupValue(tipo, item)}
                  onValueChange={(value) => setGroupValue(tipo, item, value)}
                >
                  <SelectTrigger className={input}>
                    <SelectValue placeholder="VINCULAR..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(tipo === "gerente"
                      ? managerNameOptions
                      : options(tipo, item.contexts[0])
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  title="Criar cadastro histórico"
                  onClick={() => {
                    setCreate({ tipo, alias: item.alias, context: item.contexts[0] });
                    setNewName(item.alias);
                  }}
                  className="grid h-9 w-9 place-items-center border border-[#39FF14]/30 text-[#39FF14] hover:bg-[#39FF14]/10"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
            );
          })}
      </div>
    </section>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className={button} variant="outline">
            <Upload className="mr-1 h-4 w-4" /> Importar histórico
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[92vh] max-w-7xl overflow-y-auto rounded-none border-[#39FF14]/40 bg-black/95 text-white backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm uppercase tracking-[.22em] text-[#39FF14]">
              / / Histórico contábil
            </DialogTitle>
          </DialogHeader>
          {!raw.length ? (
            <div className="space-y-5 py-4">
              <div className="border border-dashed border-[#39FF14]/35 p-8 text-center">
                <Upload className="mx-auto h-8 w-8 text-[#39FF14]" />
                <h3 className="mt-3 text-xs font-bold uppercase tracking-widest">
                  Selecione XLSX ou CSV
                </h3>
                <Input
                  type="file"
                  accept=".xlsx,.csv"
                  className="mx-auto mt-5 max-w-md rounded-none"
                  onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                {FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className="border border-white/10 px-2 py-2 text-[8px] uppercase tracking-wider text-white/45"
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between border-b border-white/10 pb-3 text-xs">
                <strong>{fileName}</strong>
                <button onClick={() => setRaw([])} className="text-[#39FF14]">
                  TROCAR ARQUIVO
                </button>
              </div>
              <section>
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#39FF14]">
                  01 · Colunas
                </h3>
                <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label className="text-[8px] uppercase text-white/45">{f.label}</Label>
                      <Select
                        value={mapping[f.key] || "__none"}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [f.key]: v === "__none" ? undefined : v }))
                        }
                      >
                        <SelectTrigger className={input}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">NÃO MAPEAR</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </section>
              <div className="grid grid-cols-3 gap-2 text-center text-[9px] uppercase">
                <div className="border border-white/10 p-3">
                  Linhas <strong className="ml-2 text-white">{raw.length}</strong>
                </div>
                <div className="border border-green-500/30 p-3">
                  Válidas <strong className="ml-2 text-[#39FF14]">{parsed.valid.length}</strong>
                </div>
                <div className="border border-red-500/30 p-3">
                  Inválidas <strong className="ml-2 text-red-400">{parsed.errors.length}</strong>
                </div>
              </div>
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[.2em] text-[#39FF14]">
                    02 · Vínculos{" "}
                    <span className="text-white/35">({pendingValidation} para validar)</span>
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={validateAll}
                    disabled={pendingValidation === 0}
                    className={button}
                  >
                    Validar todos
                  </Button>
                </div>
                <p className="text-[9px] uppercase leading-5 tracking-wider text-white/35">
                  Cada pessoa aparece uma vez. Quando ela teve mais de um SUP, o histórico mantém
                  automaticamente a equipe correspondente a cada linha e período.
                </p>
                {pendingItems.length > 0 && (
                  <div className="border border-amber-400/25 bg-amber-400/[.04] px-3 py-2 text-[9px] uppercase leading-5 tracking-wider text-amber-200/80">
                    Aguardando validação: {pendingNames.join(" · ")}
                  </div>
                )}
                <LinkRows tipo="diretor" values={displayUniques.diretor} />
                <LinkRows tipo="superintendente" values={displayUniques.superintendente} />
                <LinkRows tipo="gerente" values={displayUniques.gerente} />
              </section>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={importRows}
                  disabled={busy || unresolved > 0 || pendingValidation > 0}
                  className="bg-[#39FF14] text-black hover:bg-[#39FF14]/80"
                >
                  {busy ? "Importando..." : `Importar ${parsed.valid.length} registros`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(create)} onOpenChange={(value) => !value && setCreate(null)}>
        <DialogContent className="rounded-none border-[#39FF14]/40 bg-black/95 text-white">
          <DialogHeader>
            <DialogTitle className="text-sm uppercase tracking-widest text-[#39FF14]">
              Novo cadastro histórico
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nome</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className={input} />
          </div>
          <p className="text-xs text-white/40">
            Este cadastro serve somente para histórico e filtros. Ele não cria login no sistema.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreate(null)}>
              Cancelar
            </Button>
            <Button onClick={createPerson} disabled={creating} className="bg-[#39FF14] text-black">
              <Plus className="mr-1 h-4 w-4" />
              {creating ? "Criando..." : "Criar e vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
