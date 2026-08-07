/* eslint-disable @typescript-eslint/no-explicit-any */
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
  diretor_profile_id: string | null;
  superintendente_profile_id: string | null;
  gerente_id: string | null;
  sincronizado_em: string;
};

type HierarquiaTipo = "diretor" | "superintendente" | "gerente";

async function assertAdmin(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (!roles?.some((row) => row.role === "admin")) throw new Error("Acesso negado");
  return data.user.id;
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

function normalizeHierarchy(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(diretor|superintendente|super|gerente)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      diretor_profile_id: null,
      superintendente_profile_id: null,
      gerente_id: null,
      sincronizado_em: now,
    });
  }
  return { rows: [...deduplicated.values()], ignored };
}

async function hierarchyMaps() {
  const { data, error } = await (supabaseAdmin as any)
    .from("vendas_hierarquia_aliases")
    .select("tipo, alias_normalizado, profile_id, gerente_id");
  if (error) throw new Error(error.message);
  const diretor = new Map<string, string>();
  const superintendente = new Map<string, string>();
  const gerente = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.tipo === "diretor" && row.profile_id)
      diretor.set(row.alias_normalizado, row.profile_id);
    if (row.tipo === "superintendente" && row.profile_id) {
      superintendente.set(row.alias_normalizado, row.profile_id);
    }
    if (row.tipo === "gerente" && row.gerente_id)
      gerente.set(row.alias_normalizado, row.gerente_id);
  }
  return { diretor, superintendente, gerente };
}

function resolveHierarchy<T extends Pick<VendaSheet, "diretor" | "superintendente" | "gerente">>(
  row: T,
  maps: Awaited<ReturnType<typeof hierarchyMaps>>,
) {
  return {
    ...row,
    diretor_profile_id: maps.diretor.get(normalizeHierarchy(row.diretor)) ?? null,
    superintendente_profile_id:
      maps.superintendente.get(normalizeHierarchy(row.superintendente)) ?? null,
    gerente_id: maps.gerente.get(normalizeHierarchy(row.gerente)) ?? null,
  };
}

async function reapplyHierarchyLinks() {
  const maps = await hierarchyMaps();
  for (const table of ["vendas_salesforce", "pastas_salesforce_pv"]) {
    const { data: sourceRows, error } = await (supabaseAdmin as any)
      .from(table)
      .select("id, diretor, superintendente, gerente");
    if (error) throw new Error(error.message);
    const resolved = (sourceRows ?? []).map((row: any) => resolveHierarchy(row, maps));
    for (let start = 0; start < resolved.length; start += 50) {
      await Promise.all(
        resolved.slice(start, start + 50).map(async (row: any) => {
          const { error: updateError } = await (supabaseAdmin as any)
            .from(table)
            .update({
              diretor_profile_id: row.diretor_profile_id,
              superintendente_profile_id: row.superintendente_profile_id,
              gerente_id: row.gerente_id,
            })
            .eq("id", row.id);
          if (updateError) throw new Error(updateError.message);
        }),
      );
    }
  }
}

export const vendasSheetsList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
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
    const mapped = mapRows(parseCsv(csv));
    const maps = await hierarchyMaps();
    const rows = mapped.rows.map((row) => resolveHierarchy(row, maps));
    const { ignored } = mapped;
    if (!rows.length) throw new Error("Nenhuma venda válida foi encontrada na planilha");
    const batchSize = 500;
    for (let start = 0; start < rows.length; start += batchSize) {
      const { error } = await (supabaseAdmin as any)
        .from("vendas_salesforce")
        .upsert(rows.slice(start, start + batchSize), { onConflict: "proposta_identificador" });
      if (error) throw new Error(error.message);
    }

    // O Sheets é a fonte única: só removemos registros antigos depois que todos os
    // registros atuais foram validados e gravados com sucesso.
    const currentProposals = new Set(rows.map((row) => row.proposta_identificador));
    const { data: storedRows, error: storedError } = await (supabaseAdmin as any)
      .from("vendas_salesforce")
      .select("id, proposta_identificador");
    if (storedError) throw new Error(storedError.message);
    const staleIds = (storedRows ?? [])
      .filter((row: any) => !currentProposals.has(row.proposta_identificador))
      .map((row: any) => row.id as string);
    let removed = 0;
    for (let start = 0; start < staleIds.length; start += batchSize) {
      const { error: deleteError, count } = await (supabaseAdmin as any)
        .from("vendas_salesforce")
        .delete({ count: "exact" })
        .in("id", staleIds.slice(start, start + batchSize));
      if (deleteError) throw new Error(deleteError.message);
      removed += count ?? 0;
    }

    return {
      synchronized: rows.length,
      removed,
      ignored,
      synchronizedAt: rows[0].sincronizado_em,
    };
  });

export const vendasHierarchyList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const [
      { data: vendas },
      { data: pastas },
      { data: aliases },
      { data: profiles },
      { data: gerentes },
    ] = await Promise.all([
      (supabaseAdmin as any).from("vendas_salesforce").select("diretor, superintendente, gerente"),
      (supabaseAdmin as any)
        .from("pastas_salesforce_pv")
        .select("diretor, superintendente, gerente"),
      (supabaseAdmin as any)
        .from("vendas_hierarquia_aliases")
        .select("id, tipo, alias, alias_normalizado, profile_id, gerente_id"),
      supabaseAdmin
        .from("profiles")
        .select("id, nome, email, cargo, diretor_id")
        .in("cargo", ["diretor", "superintendente"]),
      supabaseAdmin
        .from("gerentes")
        .select("id, nome, superintendente_id, ativo")
        .eq("ativo", true),
    ]);

    const aliasByKey = new Map<string, any>();
    for (const row of aliases ?? []) {
      aliasByKey.set(`${row.tipo}:${row.alias_normalizado}`, row);
    }
    const profileSuggestion = new Map<string, string>();
    for (const profile of profiles ?? []) {
      profileSuggestion.set(normalizeHierarchy((profile as any).nome), (profile as any).id);
    }
    const gerenteSuggestion = new Map<string, string>();
    for (const gerente of gerentes ?? []) {
      gerenteSuggestion.set(normalizeHierarchy((gerente as any).nome), (gerente as any).id);
    }

    const build = (tipo: HierarquiaTipo, field: HierarquiaTipo) => {
      const distinct = new Map<string, string>();
      for (const source of [...(vendas ?? []), ...(pastas ?? [])]) {
        const raw = String(source[field] ?? "").trim();
        const normalized = normalizeHierarchy(raw);
        if (raw && normalized && !distinct.has(normalized)) distinct.set(normalized, raw);
      }
      return [...distinct.entries()]
        .map(([alias_normalizado, alias]) => {
          const current = aliasByKey.get(`${tipo}:${alias_normalizado}`);
          const suggestion =
            tipo === "gerente"
              ? gerenteSuggestion.get(alias_normalizado)
              : profileSuggestion.get(alias_normalizado);
          return {
            alias,
            alias_normalizado,
            profile_id: current?.profile_id ?? null,
            gerente_id: current?.gerente_id ?? null,
            suggested_id: current ? null : (suggestion ?? null),
          };
        })
        .sort((a, b) => a.alias.localeCompare(b.alias, "pt-BR"));
    };

    return {
      diretores: build("diretor", "diretor"),
      superintendentes: build("superintendente", "superintendente"),
      gerentes: build("gerente", "gerente"),
      profiles: (profiles ?? []).map((profile: any) => ({
        id: profile.id,
        nome: profile.nome || profile.email,
        cargo: profile.cargo,
        diretor_id: profile.diretor_id,
      })),
      gerentesCadastro: (gerentes ?? []).map((gerente: any) => ({
        id: gerente.id,
        nome: gerente.nome,
        superintendente_id: gerente.superintendente_id,
      })),
    };
  });

const HierarchyUpsertInput = z.object({
  token: z.string().min(1),
  tipo: z.enum(["diretor", "superintendente", "gerente"]),
  alias: z.string().trim().min(1).max(200),
  destino_id: z.string().uuid(),
});

export const vendasHierarchyUpsert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HierarchyUpsertInput.parse(input))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const aliasNormalizado = normalizeHierarchy(data.alias);
    if (!aliasNormalizado) throw new Error("Nome de origem inválido");
    const row = {
      tipo: data.tipo,
      alias: data.alias.trim(),
      alias_normalizado: aliasNormalizado,
      profile_id: data.tipo === "gerente" ? null : data.destino_id,
      gerente_id: data.tipo === "gerente" ? data.destino_id : null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabaseAdmin as any)
      .from("vendas_hierarquia_aliases")
      .upsert(row, { onConflict: "tipo,alias_normalizado" });
    if (error) throw new Error(error.message);
    await reapplyHierarchyLinks();
    return { ok: true };
  });

const HierarchyDeleteInput = z.object({
  token: z.string().min(1),
  tipo: z.enum(["diretor", "superintendente", "gerente"]),
  alias_normalizado: z.string().min(1),
});

export const vendasHierarchyDelete = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HierarchyDeleteInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { error } = await (supabaseAdmin as any)
      .from("vendas_hierarquia_aliases")
      .delete()
      .eq("tipo", data.tipo)
      .eq("alias_normalizado", data.alias_normalizado);
    if (error) throw new Error(error.message);
    await reapplyHierarchyLinks();
    return { ok: true };
  });
