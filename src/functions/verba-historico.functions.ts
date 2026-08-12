/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OrigemTipo = z.enum(["superintendente", "destino"]);
const DestinoTipo = z.enum(["diretor", "superintendente", "gerente"]);

const TokenInput = z.object({ token: z.string().min(1) });

const VinculoInput = z.object({
  token: z.string().min(1),
  origem_tipo: OrigemTipo,
  alias: z.string().trim().min(1).max(200),
  contexto_alias: z.string().trim().max(200).default(""),
  destino_tipo: DestinoTipo,
  target_id: z.string().uuid(),
});

const DeleteVinculoInput = z.object({
  token: z.string().min(1),
  id: z.string().uuid(),
});

const ImportRow = z.object({
  linha: z.number().int().positive(),
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2000).max(2100),
  sup: z.string().trim().min(1).max(200),
  destino: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(3000).nullable().optional(),
  valor: z.number().min(0).max(1_000_000_000),
  data: z.string().datetime(),
  ocorrencia: z.number().int().positive().default(1),
});

const ImportInput = z.object({
  token: z.string().min(1),
  categoria: z.enum(["agilitas", "marketing"]),
  rows: z.array(ImportRow).min(1).max(10000),
  vinculos: z
    .array(VinculoInput.omit({ token: true }))
    .min(1)
    .max(2000),
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

async function resolveTarget(destinoTipo: z.infer<typeof DestinoTipo>, targetId: string) {
  if (destinoTipo === "gerente") {
    const { data, error } = await supabaseAdmin
      .from("gerentes")
      .select("id,nome,superintendente_id")
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
  if (!data || data.cargo !== destinoTipo) {
    throw new Error(
      `${destinoTipo === "diretor" ? "Diretor" : "Superintendente"} do vinculo nao encontrado`,
    );
  }
  return { profile_id: data.id, gerente_id: null };
}

async function saveVinculo(userId: string, input: Omit<z.infer<typeof VinculoInput>, "token">) {
  if (
    input.origem_tipo === "superintendente" &&
    input.destino_tipo !== "superintendente" &&
    input.destino_tipo !== "diretor"
  ) {
    throw new Error("O SUP da tabela deve ser vinculado a um diretor ou superintendente interno");
  }
  const target = await resolveTarget(input.destino_tipo, input.target_id);
  const contextoAlias = input.origem_tipo === "destino" ? input.contexto_alias.trim() : "";
  if (input.origem_tipo === "destino" && input.destino_tipo === "gerente" && !contextoAlias) {
    throw new Error("O vínculo do gerente precisa informar o SUP da linha");
  }
  const row = {
    origem_tipo: input.origem_tipo,
    alias: input.alias.trim(),
    alias_normalizado: normalizeAlias(input.alias),
    contexto_alias: contextoAlias,
    contexto_normalizado: normalizeAlias(contextoAlias),
    destino_tipo: input.destino_tipo,
    profile_id: target.profile_id,
    gerente_id: target.gerente_id,
    criado_por: userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await (supabaseAdmin as any)
    .from("verba_cury_historico_vinculos")
    .upsert(row, { onConflict: "origem_tipo,alias_normalizado,contexto_normalizado" })
    .select(
      "id,origem_tipo,alias,alias_normalizado,contexto_alias,contexto_normalizado,destino_tipo,profile_id,gerente_id,updated_at",
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

export const verbaHistoricoVinculosList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("verba_cury_historico_vinculos")
      .select(
        "id,origem_tipo,alias,alias_normalizado,contexto_alias,contexto_normalizado,destino_tipo,profile_id,gerente_id,updated_at",
      )
      .order("alias", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const verbaHistoricoVinculoUpsert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VinculoInput.parse(input))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const { token: _token, ...input } = data;
    return saveVinculo(userId, input);
  });

export const verbaHistoricoVinculoDelete = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteVinculoInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { error } = await (supabaseAdmin as any)
      .from("verba_cury_historico_vinculos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verbaHistoricoImport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data: rawData }) => {
    const validation = ImportInput.safeParse(rawData);
    if (!validation.success) {
      const details = validation.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "dados"}: ${issue.message}`)
        .join("; ");
      throw new Error(`Dados da importação inválidos. ${details}`);
    }
    const data = validation.data;
    const userId = await assertAdmin(data.token);

    for (const { origem_tipo, alias, contexto_alias, destino_tipo, target_id } of data.vinculos) {
      await saveVinculo(userId, { origem_tipo, alias, contexto_alias, destino_tipo, target_id });
    }

    const { data: saved, error: linksError } = await (supabaseAdmin as any)
      .from("verba_cury_historico_vinculos")
      .select(
        "origem_tipo,alias,alias_normalizado,contexto_alias,contexto_normalizado,destino_tipo,profile_id,gerente_id",
      );
    if (linksError) throw new Error(linksError.message);

    const supLinks = new Map<string, any>();
    const destinationLinks = new Map<string, any>();
    for (const link of saved ?? []) {
      const target = link.origem_tipo === "superintendente" ? supLinks : destinationLinks;
      target.set(
        link.origem_tipo === "destino"
          ? `${link.alias_normalizado}:${link.contexto_normalizado}`
          : link.alias_normalizado,
        link,
      );
    }

    const profileIds = new Set<string>();
    const gerenteIds = new Set<string>();
    for (const link of saved ?? []) {
      if (link.profile_id) profileIds.add(link.profile_id);
      if (link.gerente_id) gerenteIds.add(link.gerente_id);
    }
    const [{ data: profiles, error: profileError }, { data: gerentes, error: gerentesError }] =
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
              .select("id,nome,superintendente_id")
              .in("id", Array.from(gerenteIds))
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (profileError) throw new Error(profileError.message);
    if (gerentesError) throw new Error(gerentesError.message);

    const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    const gerenteById = new Map((gerentes ?? []).map((gerente: any) => [gerente.id, gerente]));
    const requiredSupIds = new Set<string>();
    for (const row of data.rows) {
      const source = supLinks.get(normalizeAlias(row.sup));
      const destination =
        destinationLinks.get(`${normalizeAlias(row.destino)}:${normalizeAlias(row.sup)}`) ??
        destinationLinks.get(`${normalizeAlias(row.destino)}:`);
      if (!source) throw new Error(`Linha ${row.linha}: SUP "${row.sup}" ainda nao foi vinculado`);
      if (!destination)
        throw new Error(`Linha ${row.linha}: destino "${row.destino}" ainda nao foi vinculado`);
      if (
        (source.destino_tipo !== "superintendente" && source.destino_tipo !== "diretor") ||
        !source.profile_id
      ) {
        throw new Error(`Linha ${row.linha}: vinculo do SUP "${row.sup}" e invalido`);
      }
      requiredSupIds.add(source.profile_id);
      if (destination.destino_tipo === "gerente") {
        const gerente = gerenteById.get(destination.gerente_id) as any;
        if (!gerente)
          throw new Error(
            `Linha ${row.linha}: gerente vinculado a "${row.destino}" nao existe mais`,
          );
        requiredSupIds.add(gerente.superintendente_id);
      }
    }

    const missingSupIds = Array.from(requiredSupIds).filter((id) => !profileById.has(id));
    if (missingSupIds.length) {
      const { data: extraSups, error } = await supabaseAdmin
        .from("profiles")
        .select("id,nome,email,cargo,diretor_id")
        .in("id", missingSupIds);
      if (error) throw new Error(error.message);
      for (const profile of extraSups ?? []) profileById.set(profile.id, profile);
    }

    const directorIds = Array.from(
      new Set(
        Array.from(requiredSupIds)
          .map((id) => (profileById.get(id) as any)?.diretor_id)
          .filter(Boolean),
      ),
    ) as string[];
    if (directorIds.length) {
      const { data: directors, error } = await supabaseAdmin
        .from("profiles")
        .select("id,nome,email,cargo,diretor_id")
        .in("id", directorIds);
      if (error) throw new Error(error.message);
      for (const profile of directors ?? []) profileById.set(profile.id, profile);
    }

    type Prepared = {
      source: z.infer<typeof ImportRow>;
      key: string;
      ownerId: string;
      ownerName: string;
      directorName: string | null;
      destinationName: string;
      destinationType: z.infer<typeof DestinoTipo>;
      gerenteName: string | null;
      ownerType: "diretor" | "superintendente";
      hierarchySupName: string | null;
    };
    const prepared: Prepared[] = [];
    for (const row of data.rows) {
      const sourceLink = supLinks.get(normalizeAlias(row.sup));
      const destinationLink =
        destinationLinks.get(`${normalizeAlias(row.destino)}:${normalizeAlias(row.sup)}`) ??
        destinationLinks.get(`${normalizeAlias(row.destino)}:`);
      const owner = profileById.get(sourceLink.profile_id) as any;
      if (!owner || (owner.cargo !== "superintendente" && owner.cargo !== "diretor")) {
        throw new Error(
          `Linha ${row.linha}: diretor ou superintendente interno de "${row.sup}" nao encontrado`,
        );
      }
      const ownerName = owner.nome || owner.email || row.sup;
      const director =
        owner.cargo === "diretor"
          ? owner
          : owner.diretor_id
            ? (profileById.get(owner.diretor_id) as any)
            : null;
      let destinationName = row.destino;
      let gerenteName: string | null = null;
      let hierarchySupName: string | null = owner.cargo === "superintendente" ? ownerName : null;
      if (destinationLink.destino_tipo === "gerente") {
        const gerente = gerenteById.get(destinationLink.gerente_id) as any;
        const gerenteSup = profileById.get(gerente.superintendente_id) as any;
        if (owner.cargo === "superintendente" && gerente.superintendente_id !== owner.id) {
          throw new Error(
            `Linha ${row.linha}: o gerente "${row.destino}" não pertence ao SUP "${row.sup}" da linha`,
          );
        }
        destinationName = gerente.nome;
        gerenteName = gerente.nome;
        hierarchySupName = gerenteSup?.nome || gerenteSup?.email || ownerName;
      } else {
        const destinationProfile = profileById.get(destinationLink.profile_id) as any;
        destinationName = destinationProfile?.nome || destinationProfile?.email || row.destino;
        if (destinationLink.destino_tipo === "superintendente") hierarchySupName = destinationName;
      }
      const canonical = JSON.stringify({
        mes: row.mes,
        ano: row.ano,
        sup: normalizeAlias(row.sup),
        destino: normalizeAlias(row.destino),
        descricao: row.descricao || "",
        valor: row.valor,
        data: row.data,
      });
      prepared.push({
        source: row,
        key: await sha256(`${canonical}:${row.ocorrencia}`),
        ownerId: owner.id,
        ownerName,
        ownerType: owner.cargo,
        directorName: director?.nome || director?.email || null,
        destinationName,
        destinationType: destinationLink.destino_tipo,
        gerenteName,
        hierarchySupName,
      });
    }

    const existingKeys = new Set<string>();
    const keys = prepared.map((row) => row.key);
    for (let index = 0; index < keys.length; index += 500) {
      const { data: existing, error } = await (supabaseAdmin as any)
        .from("lancamentos")
        .select("importacao_historica_chave")
        .in("importacao_historica_chave", keys.slice(index, index + 500));
      if (error) throw new Error(error.message);
      for (const row of existing ?? []) existingKeys.add(row.importacao_historica_chave);
    }
    const newRows = prepared.filter((row) => !existingKeys.has(row.key));

    const groups = new Map<string, Prepared[]>();
    for (const row of newRows) {
      const groupKey = `${row.ownerId}:${row.source.ano}:${row.source.mes}`;
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
        .select("id,valor_agilitas,valor_marketing,status")
        .eq("usuario_id", first.ownerId)
        .eq("tipo", "verba_cury")
        .eq("tipo_verba", "cury")
        .eq("mes_referencia", first.source.mes)
        .eq("ano_referencia", first.source.ano)
        .order("created_at", { ascending: true })
        .limit(1);
      if (findError) throw new Error(findError.message);

      const groupValue = group.reduce((total, row) => total + row.source.valor, 0);
      let formId: string;
      let createdForm = false;
      let currentAgilitas = 0;
      let currentMarketing = 0;
      if (existingForms?.[0]) {
        formId = existingForms[0].id;
        currentAgilitas = Number(existingForms[0].valor_agilitas || 0);
        currentMarketing = Number(existingForms[0].valor_marketing || 0);
        formsUpdated += 1;
      } else {
        const { data: created, error: createError } = await supabaseAdmin
          .from("formularios")
          .insert({
            usuario_id: first.ownerId,
            tipo: "verba_cury",
            tipo_verba: "cury",
            nome: first.ownerName,
            diretor: first.directorName,
            superintendente: first.ownerType === "superintendente" ? first.ownerName : null,
            responsavel: first.ownerName,
            mes_referencia: first.source.mes,
            ano_referencia: first.source.ano,
            valor_agilitas: data.categoria === "agilitas" ? groupValue : 0,
            valor_marketing: data.categoria === "marketing" ? groupValue : 0,
            status: "validado",
          })
          .select("id")
          .single();
        if (createError) throw new Error(createError.message);
        formId = created.id;
        createdForm = true;
        formsCreated += 1;
      }

      const launchRows = group.map((row) => ({
        formulario_id: formId,
        nome_recebedor: row.destinationName,
        valor: row.source.valor,
        descricao: row.source.descricao || null,
        data_hora: row.source.data,
        gerente: row.gerenteName,
        superintendente: row.hierarchySupName,
        destinacao:
          row.destinationType === "gerente"
            ? "Gerente"
            : row.destinationType === "superintendente"
              ? "Superintendente"
              : "Diretor",
        importacao_historica_chave: row.key,
        importacao_historica_em: new Date().toISOString(),
        importacao_historica_por: userId,
      }));
      const { error: insertError } = await (supabaseAdmin as any)
        .from("lancamentos")
        .insert(launchRows);
      if (insertError) {
        if (createdForm) await supabaseAdmin.from("formularios").delete().eq("id", formId);
        throw new Error(insertError.message);
      }
      inserted += launchRows.length;

      if (existingForms?.[0]) {
        const { error: updateError } = await supabaseAdmin
          .from("formularios")
          .update({
            valor_agilitas: currentAgilitas + (data.categoria === "agilitas" ? groupValue : 0),
            valor_marketing: currentMarketing + (data.categoria === "marketing" ? groupValue : 0),
            diretor: first.directorName,
            superintendente: first.ownerType === "superintendente" ? first.ownerName : null,
          })
          .eq("id", formId);
        if (updateError) {
          await (supabaseAdmin as any)
            .from("lancamentos")
            .delete()
            .in(
              "importacao_historica_chave",
              launchRows.map((row) => row.importacao_historica_chave),
            );
          throw new Error(updateError.message);
        }
      }
    }

    return {
      total: data.rows.length,
      imported: inserted,
      ignored: data.rows.length - inserted,
      forms_created: formsCreated,
      forms_updated: formsUpdated,
    };
  });
