import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TokenInput = z.object({ token: z.string().min(1) });

type VendaSheet = {
  proposta_identificador: string;
  status: string | null;
  data_assinatura: string | null;
  empreendimento: string | null;
  unidade: string | null;
  torre: string | null;
  diretor: string | null;
  superintendente: string | null;
  gerente: string | null;
  corretor: string | null;
  tipo_venda: string | null;
  diretor_fifty: string | null;
  superintendente_fifty: string | null;
  gerente_fifty: string | null;
  corretor_fifty: string | null;
  sincronizado_em: string;
};

async function assertAdmin(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (!roles?.some((row) => row.role === "admin")) throw new Error("Acesso negado");
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Integração não configurada: variável ${name} ausente`);
  return value;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function dateOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

const aliases: Record<keyof Omit<VendaSheet, "sincronizado_em">, string[]> = {
  proposta_identificador: [
    "proposta_identificador",
    "proposta",
    "identificador_proposta",
    "proposta_identificador_da_proposta",
    "pv",
    "numero_proposta",
  ],
  status: ["status", "status_proposta"],
  data_assinatura: [
    "data_assinatura",
    "dt_assinatura",
    "data_de_assinatura",
    "data_da_assinatura_do_contrato",
  ],
  empreendimento: ["empreendimento", "produto"],
  unidade: ["unidade", "apto", "apartamento"],
  torre: ["torre", "bloco"],
  diretor: ["diretor"],
  superintendente: ["superintendente", "super"],
  gerente: ["gerente"],
  corretor: ["corretor", "corretor_equipe_de_vendas"],
  tipo_venda: ["tipo_venda", "tipo_de_venda"],
  diretor_fifty: ["diretor_fifty", "diretor_50", "diretor_fifty_fifty"],
  superintendente_fifty: ["superintendente_fifty", "superintendente_50", "super_fifty"],
  gerente_fifty: ["gerente_fifty", "gerente_50"],
  corretor_fifty: ["corretor_fifty", "corretor_50", "corretor_fifty_equipe_de_vendas"],
};

function findColumn(headers: string[], field: keyof typeof aliases): number {
  return headers.findIndex((header) => aliases[field].includes(header));
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}

function mapRows(values: unknown[][]): { rows: VendaSheet[]; ignored: number } {
  if (values.length < 2) return { rows: [], ignored: 0 };
  const headers = values[0].map(normalizeHeader);
  const proposalColumn = findColumn(headers, "proposta_identificador");
  if (proposalColumn < 0) {
    throw new Error(
      "A planilha precisa ter a coluna 'Proposta Identificador' (ou 'Proposta'/'PV')",
    );
  }
  const now = new Date().toISOString();
  let ignored = 0;
  const deduplicated = new Map<string, VendaSheet>();
  for (const source of values.slice(1)) {
    const proposta = textOrNull(source[proposalColumn]);
    if (!proposta) {
      ignored += 1;
      continue;
    }
    const get = (field: keyof typeof aliases) => {
      const index = findColumn(headers, field);
      return index >= 0 ? source[index] : null;
    };
    deduplicated.set(proposta, {
      proposta_identificador: proposta,
      status: textOrNull(get("status")),
      data_assinatura: dateOrNull(get("data_assinatura")),
      empreendimento: textOrNull(get("empreendimento")),
      unidade: textOrNull(get("unidade")),
      torre: textOrNull(get("torre")),
      diretor: textOrNull(get("diretor")),
      superintendente: textOrNull(get("superintendente")),
      gerente: textOrNull(get("gerente")),
      corretor: textOrNull(get("corretor")),
      tipo_venda: textOrNull(get("tipo_venda")),
      diretor_fifty: textOrNull(get("diretor_fifty")),
      superintendente_fifty: textOrNull(get("superintendente_fifty")),
      gerente_fifty: textOrNull(get("gerente_fifty")),
      corretor_fifty: textOrNull(get("corretor_fifty")),
      sincronizado_em: now,
    });
  }
  return { rows: [...deduplicated.values()], ignored };
}

export const vendasSheetsList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    // A migration nova ainda não está refletida no arquivo de tipos gerado do Supabase.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("vendas_salesforce")
      .select("*")
      .order("data_assinatura", { ascending: false, nullsFirst: false })
      .order("proposta_identificador", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as VendaSheet[];
  });

export const vendasSheetsSync = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const endpoint = new URL(requiredEnv("GOOGLE_SHEETS_VENDAS_CSV_URL"));
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "docs.google.com") {
      throw new Error("GOOGLE_SHEETS_VENDAS_CSV_URL precisa ser uma URL HTTPS do Google Sheets");
    }
    const response = await fetch(endpoint, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Falha ao ler Google Sheets (${response.status})`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const csv = await response.text();
    if (contentType.includes("text/html") || /^\s*<!doctype html/i.test(csv)) {
      throw new Error("O link não está publicado como CSV ou ainda exige login no Google");
    }
    const { rows, ignored } = mapRows(parseCsv(csv));
    if (!rows.length) throw new Error("Nenhuma venda válida foi encontrada na planilha");
    const batchSize = 500;
    for (let start = 0; start < rows.length; start += batchSize) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin as any)
        .from("vendas_salesforce")
        .upsert(rows.slice(start, start + batchSize), { onConflict: "proposta_identificador" });
      if (error) throw new Error(error.message);
    }
    return { synchronized: rows.length, ignored, synchronizedAt: rows[0].sincronizado_em };
  });
