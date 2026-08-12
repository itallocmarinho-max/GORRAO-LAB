/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TokenInput = z.object({ token: z.string().min(1) });

type PvSheetRow = {
  pv_identificador: string;
  pv_chave: string;
  data_criacao: string | null;
  diretor: string | null;
  superintendente: string | null;
  gerente: string | null;
  empreendimento: string | null;
  diretor_profile_id: string | null;
  superintendente_profile_id: string | null;
  gerente_id: string | null;
  sincronizado_em: string;
};

type AbSheetRow = {
  ab_identificador: string;
  pv_identificador: string;
  pv_chave: string;
  data_criacao: string | null;
  sincronizado_em: string;
};

export type PastaVolumeRow = PvSheetRow & {
  id: string;
  tem_ab: boolean;
  ab_quantidade: number;
  ultima_data_ab: string | null;
};

async function viewer(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user.id),
    supabaseAdmin.from("profiles").select("cargo").eq("id", data.user.id).maybeSingle(),
  ]);
  const isAdmin = Boolean(roles?.some((row) => row.role === "admin"));
  const isDiretor = (profile as { cargo?: string } | null)?.cargo === "diretor";
  if (!isAdmin && !isDiretor) throw new Error("Acesso negado");
  return { userId: data.user.id, isAdmin };
}

async function assertAdmin(token: string) {
  const access = await viewer(token);
  if (!access.isAdmin) throw new Error("Apenas administradores podem sincronizar a planilha");
}

function requiredSheetsUrl(): URL {
  const raw =
    process.env.GOOGLE_SHEETS_PASTAS_URL?.trim() ||
    process.env.GOOGLE_SHEETS_VENDAS_CSV_URL?.trim();
  if (!raw) {
    throw new Error(
      "Integração não configurada: defina GOOGLE_SHEETS_PASTAS_URL ou GOOGLE_SHEETS_VENDAS_CSV_URL",
    );
  }
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw new Error("A URL de Pastas precisa ser um link HTTPS do Google Sheets");
  }
  return url;
}

function spreadsheetId(url: URL): string {
  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match?.[1]) throw new Error("Não foi possível identificar a planilha no link configurado");
  return match[1];
}

function sheetCsvUrl(id: string, sheet: string) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv");
  url.searchParams.set("sheet", sheet);
  return url;
}

async function fetchSheet(id: string, sheet: string): Promise<string[][]> {
  const response = await fetch(sheetCsvUrl(id, sheet), { redirect: "follow" });
  if (!response.ok) throw new Error(`Falha ao ler a aba ${sheet} (${response.status})`);
  const contentType = response.headers.get("content-type") ?? "";
  const csv = await response.text();
  if (contentType.includes("text/html") || /^\s*<!doctype html/i.test(csv)) {
    throw new Error(`A aba ${sheet} não está publicada para leitura`);
  }
  return parseCsv(csv);
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
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
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

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function dateOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function column(headers: string[], aliases: string[], label: string) {
  const index = headers.findIndex((header) => aliases.includes(header));
  if (index < 0) throw new Error(`A planilha não contém a coluna obrigatória: ${label}`);
  return index;
}

async function hierarchyMaps() {
  const [{ data, error }, { data: managers, error: managerError }] = await Promise.all([
    (supabaseAdmin as any)
      .from("vendas_hierarquia_aliases")
      .select("tipo, alias_normalizado, profile_id, gerente_id, externo"),
    supabaseAdmin.from("gerentes").select("id,nome,superintendente_id"),
  ]);
  if (error) throw new Error(error.message);
  if (managerError) throw new Error(managerError.message);
  const diretor = new Map<string, string>();
  const superintendente = new Map<string, string>();
  const gerente = new Map<string, string>();
  const gerenteNome = new Map<string, string>();
  const gerentePorNomeSup = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.externo) continue;
    if (row.tipo === "diretor" && row.profile_id)
      diretor.set(row.alias_normalizado, row.profile_id);
    if (row.tipo === "superintendente" && row.profile_id)
      superintendente.set(row.alias_normalizado, row.profile_id);
    if (row.tipo === "gerente" && row.gerente_id)
      gerente.set(row.alias_normalizado, row.gerente_id);
  }
  for (const manager of managers ?? []) {
    const nome = normalizeHierarchy(manager.nome);
    gerenteNome.set(manager.id, nome);
    gerentePorNomeSup.set(`${nome}:${manager.superintendente_id}`, manager.id);
  }
  return { diretor, superintendente, gerente, gerenteNome, gerentePorNomeSup };
}

function mapPvRows(values: string[][], maps: Awaited<ReturnType<typeof hierarchyMaps>>) {
  if (values.length < 2) return { rows: [] as PvSheetRow[], ignored: 0 };
  const headers = values[0].map(normalizeHeader);
  const indexes = {
    pv: column(
      headers,
      ["proposta_identificador_da_proposta", "proposta_identificador", "proposta", "pv"],
      "Proposta: Identificador da Proposta",
    ),
    data: column(
      headers,
      ["proposta_data_de_criacao", "data_de_criacao", "data_criacao"],
      "Proposta: Data de criação",
    ),
    diretor: column(headers, ["diretor"], "Diretor"),
    superintendente: column(headers, ["superintendente"], "Superintendente"),
    gerente: column(headers, ["gerente"], "Gerente"),
    empreendimento: column(headers, ["empreendimento", "produto"], "Empreendimento"),
  };
  const synchronizedAt = new Date().toISOString();
  const rows = new Map<string, PvSheetRow>();
  let ignored = 0;
  for (const source of values.slice(1)) {
    const pv = textOrNull(source[indexes.pv]);
    const key = normalizeKey(pv);
    if (!pv || !key) {
      ignored += 1;
      continue;
    }
    const diretor = textOrNull(source[indexes.diretor]);
    const superintendente = textOrNull(source[indexes.superintendente]);
    const gerente = textOrNull(source[indexes.gerente]);
    const supId = maps.superintendente.get(normalizeHierarchy(superintendente)) ?? null;
    const aliasGerenteId = maps.gerente.get(normalizeHierarchy(gerente)) ?? null;
    const gerenteNome = aliasGerenteId ? maps.gerenteNome.get(aliasGerenteId) : null;
    const gerenteId =
      gerenteNome && supId ? (maps.gerentePorNomeSup.get(`${gerenteNome}:${supId}`) ?? null) : null;
    rows.set(key, {
      pv_identificador: pv,
      pv_chave: key,
      data_criacao: dateOrNull(source[indexes.data]),
      diretor,
      superintendente,
      gerente,
      empreendimento: textOrNull(source[indexes.empreendimento]),
      diretor_profile_id: maps.diretor.get(normalizeHierarchy(diretor)) ?? null,
      superintendente_profile_id: supId,
      gerente_id: gerenteId,
      sincronizado_em: synchronizedAt,
    });
  }
  return { rows: [...rows.values()], ignored };
}

function mapAbRows(values: string[][]) {
  if (values.length < 2) return { rows: [] as AbSheetRow[], ignored: 0 };
  const headers = values[0].map(normalizeHeader);
  const indexes = {
    ab: column(
      headers,
      ["analise_bancaria_nome_de_analise_bancaria", "nome_de_analise_bancaria", "ab"],
      "Análise Bancária: Nome de Análise Bancária",
    ),
    pv: column(headers, ["proposta", "pv", "proposta_identificador"], "Proposta"),
    data: column(
      headers,
      ["analise_bancaria_data_de_criacao", "data_de_criacao", "data_criacao"],
      "Análise Bancária: Data de criação",
    ),
  };
  const synchronizedAt = new Date().toISOString();
  const rows = new Map<string, AbSheetRow>();
  let ignored = 0;
  for (const source of values.slice(1)) {
    const ab = textOrNull(source[indexes.ab]);
    const pv = textOrNull(source[indexes.pv]);
    const key = normalizeKey(pv);
    if (!ab || !pv || !key) {
      ignored += 1;
      continue;
    }
    rows.set(normalizeKey(ab), {
      ab_identificador: ab,
      pv_identificador: pv,
      pv_chave: key,
      data_criacao: dateOrNull(source[indexes.data]),
      sincronizado_em: synchronizedAt,
    });
  }
  return { rows: [...rows.values()], ignored };
}

async function upsertBatches(table: string, rows: Record<string, unknown>[], onConflict: string) {
  const batchSize = 500;
  for (let start = 0; start < rows.length; start += batchSize) {
    const { error } = await (supabaseAdmin as any)
      .from(table)
      .upsert(rows.slice(start, start + batchSize), { onConflict });
    if (error) throw new Error(error.message);
  }
}

async function selectAll(table: string, order: string) {
  const all: any[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await (supabaseAdmin as any)
      .from(table)
      .select("*")
      .order(order, { ascending: false, nullsFirst: false })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return all;
}

export const pastasSheetsList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await viewer(data.token);
    const [pvs, abs, profilesResult, managersResult] = await Promise.all([
      selectAll("pastas_salesforce_pv", "data_criacao"),
      selectAll("pastas_salesforce_ab", "data_criacao"),
      supabaseAdmin.from("profiles").select("id, nome, email"),
      supabaseAdmin.from("gerentes").select("id, nome"),
    ]);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (managersResult.error) throw new Error(managersResult.error.message);
    const profileNames = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile.nome || profile.email]),
    );
    const managerNames = new Map(
      (managersResult.data ?? []).map((manager) => [manager.id, manager.nome]),
    );
    const abByPv = new Map<string, { count: number; latest: string | null }>();
    for (const ab of abs) {
      const current = abByPv.get(ab.pv_chave) ?? { count: 0, latest: null };
      current.count += 1;
      if (ab.data_criacao && (!current.latest || ab.data_criacao > current.latest)) {
        current.latest = ab.data_criacao;
      }
      abByPv.set(ab.pv_chave, current);
    }
    const rows: PastaVolumeRow[] = pvs.map((pv) => {
      const relation = abByPv.get(pv.pv_chave);
      return {
        ...pv,
        diretor: pv.diretor_profile_id
          ? (profileNames.get(pv.diretor_profile_id) ?? pv.diretor)
          : pv.diretor,
        superintendente: pv.superintendente_profile_id
          ? (profileNames.get(pv.superintendente_profile_id) ?? pv.superintendente)
          : pv.superintendente,
        gerente: pv.gerente_id ? (managerNames.get(pv.gerente_id) ?? pv.gerente) : pv.gerente,
        tem_ab: Boolean(relation?.count),
        ab_quantidade: relation?.count ?? 0,
        ultima_data_ab: relation?.latest ?? null,
      };
    });
    const knownPvs = new Set(pvs.map((pv) => pv.pv_chave));
    const pendingAb = abs.filter((ab) => !knownPvs.has(ab.pv_chave)).length;
    const lastSync = [...pvs, ...abs].reduce<string | null>(
      (latest, row) => (!latest || row.sincronizado_em > latest ? row.sincronizado_em : latest),
      null,
    );
    return { rows, abTotal: abs.length, pendingAb, lastSync };
  });

export const pastasSheetsSync = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const id = spreadsheetId(requiredSheetsUrl());
    const maps = await hierarchyMaps();
    const [pvValues, abValues] = await Promise.all([
      fetchSheet(id, "LAB / / PV"),
      fetchSheet(id, "LAB / / AB"),
    ]);
    const pvs = mapPvRows(pvValues, maps);
    const abs = mapAbRows(abValues);
    if (!pvs.rows.length) throw new Error("Nenhuma PV válida foi encontrada na aba LAB / / PV");
    await upsertBatches("pastas_salesforce_pv", pvs.rows, "pv_chave");
    if (abs.rows.length) {
      await upsertBatches("pastas_salesforce_ab", abs.rows, "ab_identificador");
    }
    const storedPvs = await selectAll("pastas_salesforce_pv", "data_criacao");
    const storedAbs = await selectAll("pastas_salesforce_ab", "data_criacao");
    const knownPvs = new Set(storedPvs.map((row) => row.pv_chave));
    const pendingAb = storedAbs.filter((row) => !knownPvs.has(row.pv_chave)).length;
    const matchedPv = new Set(
      storedAbs.filter((row) => knownPvs.has(row.pv_chave)).map((row) => row.pv_chave),
    ).size;
    return {
      pvsSynchronized: pvs.rows.length,
      absSynchronized: abs.rows.length,
      pvsStored: storedPvs.length,
      absStored: storedAbs.length,
      matchedPv,
      pendingAb,
      ignored: pvs.ignored + abs.ignored,
      synchronizedAt: new Date().toISOString(),
    };
  });
