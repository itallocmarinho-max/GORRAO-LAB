/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OrigemTipo = z.enum(["diretor", "superintendente", "gerente"]);
const TokenInput = z.object({ token: z.string().min(1) });

const VinculoBase = z.object({
  origem_tipo: OrigemTipo,
  alias: z.string().trim().min(1).max(200),
  contexto_alias: z.string().trim().max(200).default(""),
  target_id: z.string().uuid(),
});

const VinculoInput = VinculoBase.extend({ token: z.string().min(1) });

const DeleteVinculoInput = z.object({
  token: z.string().min(1),
  id: z.string().uuid(),
});

const BaseRow = z.object({
  linha: z.number().int().positive(),
  diretor: z.string().trim().min(1).max(200),
  sup: z.string().trim().min(1).max(200),
  gerente: z.string().trim().min(1).max(200),
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2000).max(2100),
  ocorrencia: z.number().int().positive().default(1),
});

const VendasRow = BaseRow.extend({
  tipo: z.literal("vendas"),
  meta_gerente: z.number().min(0).max(1_000_000_000),
  meta_sup: z.number().min(0).max(1_000_000_000),
  plantao: z.string().trim().min(1).max(300),
});

const VerbaRow = BaseRow.extend({
  tipo: z.literal("verba"),
  verba_cury: z.number().min(0).max(1_000_000_000),
  verba_sup: z.number().min(0).max(1_000_000_000),
  verba_gerente: z.number().min(0).max(1_000_000_000),
});

const ImportRow = z.discriminatedUnion("tipo", [VendasRow, VerbaRow]);

const ImportInput = z.object({
  token: z.string().min(1),
  rows: z.array(ImportRow).min(1).max(500),
  vinculos: z.array(VinculoBase).min(3).max(3000),
});

const GerenteCreateInput = z.object({
  token: z.string().min(1),
  nome: z.string().trim().min(1).max(120),
  superintendente_id: z.string().uuid(),
  alias: z.string().trim().min(1).max(200),
  contexto_alias: z.string().trim().min(1).max(200),
});

async function assertAdmin(token: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Nao autenticado");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (!roles?.some((row) => row.role === "admin")) throw new Error("Acesso negado");
  return data.user.id;
}

function normalizeAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linkKey(tipo: z.infer<typeof OrigemTipo>, alias: string, contexto = "") {
  return `${tipo}:${normalizeAlias(alias)}:${tipo === "gerente" ? normalizeAlias(contexto) : ""}`;
}

async function resolveTarget(tipo: z.infer<typeof OrigemTipo>, targetId: string) {
  if (tipo === "gerente") {
    const { data, error } = await supabaseAdmin
      .from("gerentes")
      .select("id,nome,superintendente_id,ativo")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gerente do vinculo nao encontrado");
    return { profile_id: null, gerente_id: data.id };
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,cargo")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.cargo !== tipo) {
    throw new Error(`${tipo === "diretor" ? "Diretor" : "Superintendente"} nao encontrado`);
  }
  return { profile_id: data.id, gerente_id: null };
}

async function saveVinculo(userId: string, input: z.infer<typeof VinculoBase>) {
  const target = await resolveTarget(input.origem_tipo, input.target_id);
  const contextoAlias = input.origem_tipo === "gerente" ? input.contexto_alias.trim() : "";
  if (input.origem_tipo === "gerente" && !contextoAlias) {
    throw new Error("O vinculo do gerente precisa informar o superintendente da tabela");
  }
  const row = {
    origem_tipo: input.origem_tipo,
    alias: input.alias.trim(),
    alias_normalizado: normalizeAlias(input.alias),
    contexto_alias: contextoAlias,
    contexto_normalizado: normalizeAlias(contextoAlias),
    profile_id: target.profile_id,
    gerente_id: target.gerente_id,
    criado_por: userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await (supabaseAdmin as any)
    .from("planejamento_historico_vinculos")
    .upsert(row, {
      onConflict: "origem_tipo,alias_normalizado,contexto_normalizado",
    })
    .select(
      "id,origem_tipo,alias,alias_normalizado,contexto_alias,contexto_normalizado,profile_id,gerente_id,updated_at",
    )
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const planejamentoHistoricoVinculosList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const [{ data: rows, error }, { data: vendasLinks }, { data: verbaLinks }] = await Promise.all([
      (supabaseAdmin as any)
        .from("planejamento_historico_vinculos")
        .select(
          "id,origem_tipo,alias,alias_normalizado,contexto_alias,contexto_normalizado,profile_id,gerente_id,updated_at",
        )
        .order("alias", { ascending: true }),
      (supabaseAdmin as any)
        .from("vendas_hierarquia_aliases")
        .select("tipo,alias,alias_normalizado,profile_id,gerente_id,externo")
        .eq("externo", false),
      (supabaseAdmin as any)
        .from("verba_cury_historico_vinculos")
        .select("alias,alias_normalizado,destino_tipo,profile_id,gerente_id"),
    ]);
    if (error) throw new Error(error.message);

    const known = new Map<string, any>();
    for (const link of vendasLinks ?? []) {
      known.set(`${link.tipo}:${link.alias_normalizado}`, {
        origem_tipo: link.tipo,
        alias: link.alias,
        alias_normalizado: link.alias_normalizado,
        profile_id: link.profile_id,
        gerente_id: link.gerente_id,
      });
    }
    for (const link of verbaLinks ?? []) {
      const tipo = link.destino_tipo;
      if (!known.has(`${tipo}:${link.alias_normalizado}`)) {
        known.set(`${tipo}:${link.alias_normalizado}`, {
          origem_tipo: tipo,
          alias: link.alias,
          alias_normalizado: link.alias_normalizado,
          profile_id: link.profile_id,
          gerente_id: link.gerente_id,
        });
      }
    }
    return { rows: rows ?? [], known: Array.from(known.values()) };
  });

export const planejamentoHistoricoVinculoUpsert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VinculoInput.parse(input))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const { token: _token, ...input } = data;
    return saveVinculo(userId, input);
  });

export const planejamentoHistoricoVinculoDelete = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteVinculoInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { error } = await (supabaseAdmin as any)
      .from("planejamento_historico_vinculos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const planejamentoHistoricoGerenteCreate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GerenteCreateInput.parse(input))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const { data: sup, error: supError } = await supabaseAdmin
      .from("profiles")
      .select("id,cargo")
      .eq("id", data.superintendente_id)
      .maybeSingle();
    if (supError) throw new Error(supError.message);
    if (!sup || sup.cargo !== "superintendente") {
      throw new Error("Superintendente selecionado nao encontrado");
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from("gerentes")
      .select("id,nome,superintendente_id,ativo")
      .eq("superintendente_id", data.superintendente_id);
    if (currentError) throw new Error(currentError.message);
    let gerente = (current ?? []).find(
      (item) => normalizeAlias(item.nome) === normalizeAlias(data.nome),
    );
    let created = false;
    if (!gerente) {
      const { data: inserted, error } = await supabaseAdmin
        .from("gerentes")
        .insert({
          nome: data.nome.trim(),
          superintendente_id: data.superintendente_id,
          ativo: true,
        })
        .select("id,nome,superintendente_id,ativo")
        .single();
      if (error) throw new Error(error.message);
      gerente = inserted;
      created = true;
    }

    await saveVinculo(userId, {
      origem_tipo: "gerente",
      alias: data.alias,
      contexto_alias: data.contexto_alias,
      target_id: gerente.id,
    });
    return { gerente, created };
  });

export const planejamentoHistoricoImport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data: rawData }) => {
    const validation = ImportInput.safeParse(rawData);
    if (!validation.success) {
      const details = validation.error.issues
        .slice(0, 6)
        .map((issue) => `${issue.path.join(".") || "dados"}: ${issue.message}`)
        .join("; ");
      throw new Error(`Dados da importacao invalidos. ${details}`);
    }
    const data = validation.data;
    const userId = await assertAdmin(data.token);

    for (const link of data.vinculos) await saveVinculo(userId, link);

    const { data: saved, error: linksError } = await (supabaseAdmin as any)
      .from("planejamento_historico_vinculos")
      .select(
        "origem_tipo,alias,alias_normalizado,contexto_alias,contexto_normalizado,profile_id,gerente_id",
      );
    if (linksError) throw new Error(linksError.message);
    const links = new Map<string, any>();
    for (const link of saved ?? []) {
      links.set(linkKey(link.origem_tipo, link.alias, link.contexto_alias), link);
    }

    const profileIds = new Set<string>();
    const gerenteIds = new Set<string>();
    for (const link of saved ?? []) {
      if (link.profile_id) profileIds.add(link.profile_id);
      if (link.gerente_id) gerenteIds.add(link.gerente_id);
    }
    const [{ data: profiles, error: profileError }, { data: gerentes, error: gerenteError }] =
      await Promise.all([
        profileIds.size
          ? supabaseAdmin
              .from("profiles")
              .select("id,nome,email,cargo,diretor_id")
              .in("id", Array.from(profileIds))
          : Promise.resolve({ data: [], error: null }),
        gerenteIds.size
          ? supabaseAdmin
              .from("gerentes")
              .select("id,nome,superintendente_id,ativo")
              .in("id", Array.from(gerenteIds))
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (profileError) throw new Error(profileError.message);
    if (gerenteError) throw new Error(gerenteError.message);
    const profileById = new Map((profiles ?? []).map((item: any) => [item.id, item]));
    const gerenteById = new Map((gerentes ?? []).map((item: any) => [item.id, item]));

    type Row = z.infer<typeof ImportRow>;
    type Prepared = {
      source: Row;
      key: string;
      director: any;
      sup: any;
      gerente: any;
    };
    const prepared: Prepared[] = [];
    for (const row of data.rows) {
      const directorLink = links.get(linkKey("diretor", row.diretor));
      const supLink = links.get(linkKey("superintendente", row.sup));
      const managerLink = links.get(linkKey("gerente", row.gerente, row.sup));
      if (!directorLink)
        throw new Error(`Linha ${row.linha}: diretor "${row.diretor}" sem vinculo`);
      if (!supLink) throw new Error(`Linha ${row.linha}: SUP "${row.sup}" sem vinculo`);
      if (!managerLink) {
        throw new Error(
          `Linha ${row.linha}: gerente "${row.gerente}" da equipe "${row.sup}" sem vinculo`,
        );
      }
      const director = profileById.get(directorLink.profile_id) as any;
      const sup = profileById.get(supLink.profile_id) as any;
      const gerente = gerenteById.get(managerLink.gerente_id) as any;
      if (!director || director.cargo !== "diretor") {
        throw new Error(`Linha ${row.linha}: diretor interno invalido`);
      }
      if (!sup || sup.cargo !== "superintendente") {
        throw new Error(`Linha ${row.linha}: superintendente interno invalido`);
      }
      if (sup.diretor_id !== director.id) {
        throw new Error(
          `Linha ${row.linha}: ${sup.nome || sup.email} nao pertence ao diretor ${director.nome || director.email}`,
        );
      }
      if (!gerente || gerente.superintendente_id !== sup.id) {
        throw new Error(
          `Linha ${row.linha}: ${gerente?.nome || row.gerente} nao pertence ao SUP ${sup.nome || sup.email}`,
        );
      }
      const canonical =
        row.tipo === "vendas"
          ? {
              tipo: row.tipo,
              diretor: normalizeAlias(row.diretor),
              sup: normalizeAlias(row.sup),
              gerente: normalizeAlias(row.gerente),
              meta_gerente: row.meta_gerente,
              meta_sup: row.meta_sup,
              plantao: normalizeAlias(row.plantao),
              mes: row.mes,
              ano: row.ano,
            }
          : {
              tipo: row.tipo,
              diretor: normalizeAlias(row.diretor),
              sup: normalizeAlias(row.sup),
              gerente: normalizeAlias(row.gerente),
              verba_cury: row.verba_cury,
              verba_sup: row.verba_sup,
              verba_gerente: row.verba_gerente,
              mes: row.mes,
              ano: row.ano,
            };
      prepared.push({
        source: row,
        key: await sha256(`planejamento:${JSON.stringify(canonical)}:${row.ocorrencia}`),
        director,
        sup,
        gerente,
      });
    }

    const existingKeys = new Set<string>();
    const keys = prepared.map((row) => row.key);
    for (let index = 0; index < keys.length; index += 400) {
      const { data: existing, error } = await (supabaseAdmin as any)
        .from("lancamentos")
        .select("importacao_historica_chave")
        .in("importacao_historica_chave", keys.slice(index, index + 400));
      if (error) throw new Error(error.message);
      for (const row of existing ?? []) existingKeys.add(row.importacao_historica_chave);
    }
    const newRows = prepared.filter((row) => !existingKeys.has(row.key));
    const groups = new Map<string, Prepared[]>();
    for (const row of newRows) {
      const groupKey = `${row.sup.id}:${row.source.ano}:${row.source.mes}`;
      const group = groups.get(groupKey) ?? [];
      group.push(row);
      groups.set(groupKey, group);
    }

    let formsCreated = 0;
    let formsUpdated = 0;
    let inserted = 0;
    for (const group of groups.values()) {
      const first = group[0];
      const { data: existingForms, error: findError } = await supabaseAdmin
        .from("formularios")
        .select("id,status")
        .eq("usuario_id", first.sup.id)
        .eq("tipo", "planejamento")
        .eq("mes_referencia", first.source.mes)
        .eq("ano_referencia", first.source.ano)
        .order("created_at", { ascending: true })
        .limit(1);
      if (findError) throw new Error(findError.message);

      let formId: string;
      let createdForm = false;
      if (existingForms?.[0]) {
        formId = existingForms[0].id;
        formsUpdated += 1;
      } else {
        const supName = first.sup.nome || first.sup.email || first.source.sup;
        const directorName = first.director.nome || first.director.email || first.source.diretor;
        const { data: created, error } = await supabaseAdmin
          .from("formularios")
          .insert({
            usuario_id: first.sup.id,
            tipo: "planejamento",
            nome: supName,
            diretor: directorName,
            superintendente: supName,
            responsavel: supName,
            mes_referencia: first.source.mes,
            ano_referencia: first.source.ano,
            valor_agilitas: 0,
            valor_marketing: 0,
            status: "validado",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        formId = created.id;
        createdForm = true;
        formsCreated += 1;
      }

      const dataHora = new Date(
        Date.UTC(first.source.ano, first.source.mes - 1, 1, 12),
      ).toISOString();
      const launchRows = group.map((row) => {
        const base = {
          formulario_id: formId,
          data_hora: dataHora,
          gerente: row.gerente.nome,
          superintendente: row.sup.nome || row.sup.email || row.source.sup,
          mes_ref: row.source.mes,
          ano_ref: row.source.ano,
          valor: 0,
          importacao_historica_chave: row.key,
          importacao_historica_em: new Date().toISOString(),
          importacao_historica_por: userId,
        };
        return row.source.tipo === "vendas"
          ? {
              ...base,
              secao: "principal",
              plantao: row.source.plantao,
              meta_gerente: row.source.meta_gerente,
              meta_sup: row.source.meta_sup,
            }
          : {
              ...base,
              secao: "verba",
              verba_cury: row.source.verba_cury,
              verba_superintendente: row.source.verba_sup,
              verba_gerente: row.source.verba_gerente,
            };
      });
      const { error: insertError } = await (supabaseAdmin as any)
        .from("lancamentos")
        .insert(launchRows);
      if (insertError) {
        if (createdForm) await supabaseAdmin.from("formularios").delete().eq("id", formId);
        throw new Error(insertError.message);
      }
      inserted += launchRows.length;
    }

    return {
      total: data.rows.length,
      imported: inserted,
      ignored: data.rows.length - inserted,
      forms_created: formsCreated,
      forms_updated: formsUpdated,
    };
  });
