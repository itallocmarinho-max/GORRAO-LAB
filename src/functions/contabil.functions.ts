/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Tipo = z.enum(["diretor", "superintendente", "gerente"]);
const Token = z.object({ token: z.string().min(1) });
const Target = z.object({ kind: z.enum(["profile", "gerente", "pessoa"]), id: z.string().uuid() });
const LinkBase = z.object({
  tipo: Tipo,
  alias: z.string().trim().min(1).max(200),
  contexto_alias: z.string().trim().max(200).default(""),
  target: Target,
});
const LinkInput = LinkBase.extend({ token: z.string().min(1) });
const PersonInput = z.object({
  token: z.string().min(1),
  tipo: Tipo,
  nome: z.string().trim().min(1).max(160),
  alias: z.string().trim().min(1).max(200),
  contexto_alias: z.string().trim().max(200).default(""),
  parent: Target.nullable(),
});
const Row = z.object({
  linha: z.number().int().positive(),
  pv: z.string().trim().min(1).max(200),
  empreendimento: z.string().trim().max(300).default(""),
  torre: z.string().trim().max(160).default(""),
  unidade: z.string().trim().max(160).default(""),
  corretor: z.string().trim().max(240).default(""),
  gerente: z.string().trim().min(1).max(200),
  sup: z.string().trim().min(1).max(200),
  diretor: z.string().trim().min(1).max(200),
  vgv: z.number().finite().min(0).max(100_000_000_000),
  tipo_venda: z.string().trim().max(160).default(""),
  quantidade: z.number().finite().min(-1000).max(1000),
  mes: z.number().int().min(1).max(12),
  trimestre: z.string().trim().max(80).default(""),
  ano: z.number().int().min(2000).max(2100),
  canal: z.string().trim().max(160).default(""),
  cidade: z.string().trim().max(160).default(""),
  regiao: z.string().trim().max(160).default(""),
  plantao: z.string().trim().max(300).default(""),
  ocorrencia: z.number().int().positive().default(1),
});
const ImportInput = z.object({
  token: z.string().min(1),
  rows: z.array(Row).min(1).max(500),
  vinculos: z.array(LinkBase).min(3).max(5000),
});
const SummaryInput = z.object({
  token: z.string().min(1),
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2000).max(2100),
  diretor_id: z.string().uuid().nullable().default(null),
  superintendente_id: z.string().uuid().nullable().default(null),
  gerente_id: z.string().uuid().nullable().default(null),
});

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function key(tipo: z.infer<typeof Tipo>, alias: string, contexto = "") {
  return `${tipo}:${normalize(alias)}:${tipo === "diretor" ? "" : normalize(contexto)}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function auth(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user.id),
    supabaseAdmin
      .from("profiles")
      .select("id,cargo,vinculado_id")
      .eq("id", data.user.id)
      .maybeSingle(),
  ]);
  return { user: data.user, admin: Boolean(roles?.some((row) => row.role === "admin")), profile };
}

async function assertAdmin(token: string) {
  const session = await auth(token);
  if (!session.admin) throw new Error("Acesso negado");
  return session.user.id;
}

async function validateTarget(tipo: z.infer<typeof Tipo>, target: z.infer<typeof Target>) {
  if (target.kind === "profile") {
    if (tipo === "gerente") throw new Error("Gerentes devem ser vinculados ao cadastro de gerente");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,nome,email,cargo,diretor_id")
      .eq("id", target.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.cargo !== tipo) throw new Error("Usuário interno incompatível com o vínculo");
    return { profile_id: data.id, gerente_id: null, pessoa_id: null };
  }
  if (target.kind === "gerente") {
    if (tipo !== "gerente") throw new Error("Destino incompatível com o vínculo");
    const { data, error } = await supabaseAdmin
      .from("gerentes")
      .select("id,nome,superintendente_id")
      .eq("id", target.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gerente interno não encontrado");
    return { profile_id: null, gerente_id: data.id, pessoa_id: null };
  }
  const { data, error } = await (supabaseAdmin as any)
    .from("contabil_pessoas")
    .select("id,tipo,nome,parent_profile_id,parent_pessoa_id")
    .eq("id", target.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.tipo !== tipo) throw new Error("Pessoa histórica incompatível com o vínculo");
  return { profile_id: null, gerente_id: null, pessoa_id: data.id };
}

async function saveLink(userId: string, input: z.infer<typeof LinkBase>) {
  const target = await validateTarget(input.tipo, input.target);
  const contexto = input.tipo === "diretor" ? "" : input.contexto_alias.trim();
  if (input.tipo !== "diretor" && !contexto) throw new Error("Informe o contexto da hierarquia");
  const row = {
    tipo: input.tipo,
    alias: input.alias.trim(),
    alias_normalizado: normalize(input.alias),
    contexto_alias: contexto,
    contexto_normalizado: normalize(contexto),
    ...target,
    criado_por: userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await (supabaseAdmin as any)
    .from("contabil_hierarquia_aliases")
    .upsert(row, { onConflict: "tipo,alias_normalizado,contexto_normalizado" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export const contabilVinculosList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Token.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const [{ data: rows, error }, { data: pessoas }, { data: salesAliases }] = await Promise.all([
      (supabaseAdmin as any).from("contabil_hierarquia_aliases").select("*").order("alias"),
      (supabaseAdmin as any).from("contabil_pessoas").select("*").order("nome"),
      (supabaseAdmin as any)
        .from("vendas_hierarquia_aliases")
        .select("tipo,alias,alias_normalizado,profile_id,gerente_id,externo")
        .eq("externo", false),
    ]);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], pessoas: pessoas ?? [], known: salesAliases ?? [] };
  });

export const contabilVinculoUpsert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LinkInput.parse(input))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const { token: _token, ...link } = data;
    return saveLink(userId, link);
  });

export const contabilPessoaCreate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PersonInput.parse(input))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    if (data.tipo === "diretor" && data.parent)
      throw new Error("Diretor não possui responsável superior");
    if (data.tipo !== "diretor" && !data.parent) throw new Error("Selecione a hierarquia superior");
    if (data.parent && !["profile", "pessoa"].includes(data.parent.kind))
      throw new Error("Hierarquia superior inválida");
    let parent_profile_id: string | null = null;
    let parent_pessoa_id: string | null = null;
    if (data.parent) {
      const expected = data.tipo === "superintendente" ? "diretor" : "superintendente";
      const checked = await validateTarget(expected, data.parent);
      parent_profile_id = checked.profile_id;
      parent_pessoa_id = checked.pessoa_id;
    }
    const row = {
      tipo: data.tipo,
      nome: data.nome.trim(),
      nome_normalizado: normalize(data.nome),
      parent_profile_id,
      parent_pessoa_id,
      criado_por: userId,
      updated_at: new Date().toISOString(),
    };
    let existingQuery = (supabaseAdmin as any)
      .from("contabil_pessoas")
      .select("*")
      .eq("tipo", data.tipo)
      .eq("nome_normalizado", row.nome_normalizado);
    existingQuery = parent_profile_id
      ? existingQuery.eq("parent_profile_id", parent_profile_id)
      : existingQuery.is("parent_profile_id", null);
    existingQuery = parent_pessoa_id
      ? existingQuery.eq("parent_pessoa_id", parent_pessoa_id)
      : existingQuery.is("parent_pessoa_id", null);
    const { data: existing } = await existingQuery.maybeSingle();
    let pessoa = existing;
    if (!pessoa) {
      const inserted = await (supabaseAdmin as any)
        .from("contabil_pessoas")
        .insert(row)
        .select("*")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      pessoa = inserted.data;
    }
    await saveLink(userId, {
      tipo: data.tipo,
      alias: data.alias,
      contexto_alias: data.contexto_alias,
      target: { kind: "pessoa", id: pessoa.id },
    });
    return { pessoa, created: !existing };
  });

export const contabilHistoricoImport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data: raw }) => {
    const parsed = ImportInput.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues
          .slice(0, 8)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      );
    }
    const data = parsed.data;
    const userId = await assertAdmin(data.token);
    for (const link of data.vinculos) await saveLink(userId, link);
    const { data: saved, error } = await (supabaseAdmin as any)
      .from("contabil_hierarquia_aliases")
      .select("*");
    if (error) throw new Error(error.message);
    const links = new Map(
      (saved ?? []).map((link: any) => [key(link.tipo, link.alias, link.contexto_alias), link]),
    );
    const profileIds = [
      ...new Set((saved ?? []).map((link: any) => link.profile_id).filter(Boolean)),
    ];
    const managerIds = [
      ...new Set((saved ?? []).map((link: any) => link.gerente_id).filter(Boolean)),
    ];
    const personIds = [
      ...new Set((saved ?? []).map((link: any) => link.pessoa_id).filter(Boolean)),
    ];
    const [{ data: profiles }, { data: managers }, { data: people }] = await Promise.all([
      profileIds.length
        ? supabaseAdmin.from("profiles").select("id,cargo,diretor_id").in("id", profileIds)
        : Promise.resolve({ data: [] }),
      managerIds.length
        ? supabaseAdmin.from("gerentes").select("id,superintendente_id").in("id", managerIds)
        : Promise.resolve({ data: [] }),
      personIds.length
        ? (supabaseAdmin as any)
            .from("contabil_pessoas")
            .select("id,tipo,parent_profile_id,parent_pessoa_id")
            .in("id", personIds)
        : Promise.resolve({ data: [] }),
    ]);
    const profilesById = new Map((profiles ?? []).map((item: any) => [item.id, item]));
    const managersById = new Map((managers ?? []).map((item: any) => [item.id, item]));
    const peopleById = new Map((people ?? []).map((item: any) => [item.id, item]));
    const targetIdentity = (link: any) =>
      link.profile_id
        ? `profile:${link.profile_id}`
        : link.gerente_id
          ? `gerente:${link.gerente_id}`
          : `pessoa:${link.pessoa_id}`;
    const expectedParent = (link: any) => {
      if (link.profile_id) {
        const profile = profilesById.get(link.profile_id);
        return profile?.diretor_id ? `profile:${profile.diretor_id}` : null;
      }
      if (link.gerente_id) {
        const manager = managersById.get(link.gerente_id);
        return manager?.superintendente_id ? `profile:${manager.superintendente_id}` : null;
      }
      const person = peopleById.get(link.pessoa_id);
      return person?.parent_profile_id
        ? `profile:${person.parent_profile_id}`
        : person?.parent_pessoa_id
          ? `pessoa:${person.parent_pessoa_id}`
          : null;
    };
    const rows: any[] = [];
    for (const source of data.rows) {
      const diretor = links.get(key("diretor", source.diretor));
      const sup = links.get(key("superintendente", source.sup, source.diretor));
      const gerente = links.get(key("gerente", source.gerente, source.sup));
      if (!diretor) throw new Error(`Linha ${source.linha}: diretor sem vínculo`);
      if (!sup) throw new Error(`Linha ${source.linha}: SUP sem vínculo`);
      if (!gerente) throw new Error(`Linha ${source.linha}: gerente sem vínculo`);
      if (expectedParent(sup) !== targetIdentity(diretor)) {
        throw new Error(
          `Linha ${source.linha}: o SUP vinculado não pertence ao diretor selecionado`,
        );
      }
      // O gerente é uma identidade única no Contábil. O SUP da época é preservado
      // separadamente pela própria linha, portanto não deve ser comparado à equipe atual.
      const canonical = { ...source, linha: undefined, ocorrencia: undefined };
      rows.push({
        chave_origem: await sha256(`contabil:${JSON.stringify(canonical)}:${source.ocorrencia}`),
        origem: "historico",
        pv: source.pv,
        empreendimento: source.empreendimento || null,
        torre: source.torre || null,
        unidade: source.unidade || null,
        corretor: source.corretor || null,
        gerente: source.gerente,
        superintendente: source.sup,
        diretor: source.diretor,
        vgv: source.vgv,
        tipo_venda: source.tipo_venda || null,
        quantidade: source.quantidade,
        mes: source.mes,
        trimestre: source.trimestre || null,
        ano: source.ano,
        canal: source.canal || null,
        cidade: source.cidade || null,
        regiao: source.regiao || null,
        plantao: source.plantao || null,
        diretor_nome_ref: source.diretor,
        superintendente_nome_ref: source.sup,
        gerente_nome_ref: source.gerente,
        diretor_profile_id: diretor.profile_id,
        superintendente_profile_id: sup.profile_id,
        gerente_id: gerente.gerente_id,
        diretor_pessoa_id: diretor.pessoa_id,
        superintendente_pessoa_id: sup.pessoa_id,
        gerente_pessoa_id: gerente.pessoa_id,
        importado_por: userId,
        raw: source,
      });
    }
    let imported = 0;
    for (let index = 0; index < rows.length; index += 200) {
      const chunk = rows.slice(index, index + 200);
      const keys = chunk.map((row) => row.chave_origem);
      const { data: existing, error: existingError } = await (supabaseAdmin as any)
        .from("contabil_salesforce")
        .select("chave_origem")
        .in("chave_origem", keys);
      if (existingError) throw new Error(existingError.message);
      const current = new Set((existing ?? []).map((row: any) => row.chave_origem));
      const inserts = chunk.filter((row) => !current.has(row.chave_origem));
      if (inserts.length) {
        const { error: insertError } = await (supabaseAdmin as any)
          .from("contabil_salesforce")
          .insert(inserts);
        if (insertError) throw new Error(insertError.message);
        imported += inserts.length;
      }
    }
    return { total: rows.length, imported, ignored: rows.length - imported };
  });

export const contabilList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Token.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const {
      data: rows,
      error,
      count,
    } = await (supabaseAdmin as any)
      .from("contabil_salesforce")
      .select("*", { count: "exact" })
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const contabilPlanejamentoResumo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SummaryInput.parse(input))
  .handler(async ({ data }) => {
    const session = await auth(data.token);
    let roleFilter: { column: string; value: string } | null = null;
    if (!session.admin) {
      const profile = session.profile;
      if (profile?.cargo === "diretor") {
        roleFilter = { column: "diretor_profile_id", value: session.user.id };
      } else if (profile?.cargo === "superintendente") {
        roleFilter = { column: "superintendente_profile_id", value: session.user.id };
      } else if (profile?.cargo === "rh" && profile.vinculado_id) {
        const { data: linked } = await supabaseAdmin
          .from("profiles")
          .select("cargo")
          .eq("id", profile.vinculado_id)
          .maybeSingle();
        roleFilter = {
          column: linked?.cargo === "diretor" ? "diretor_profile_id" : "superintendente_profile_id",
          value: profile.vinculado_id,
        };
      } else
        return {
          quantidade: 0,
          vgv: 0,
          pvs: 0,
          porDiretor: {},
          porSup: {},
          porGerente: {},
          porPlantao: {},
        };
    }
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      let query = (supabaseAdmin as any)
        .from("contabil_salesforce")
        .select(
          "pv,quantidade,vgv,plantao,diretor_profile_id,superintendente_profile_id,gerente_id,diretor_pessoa_id,superintendente_pessoa_id,gerente_pessoa_id",
        )
        .eq("ano", data.ano)
        .eq("mes", data.mes);
      if (roleFilter) query = query.eq(roleFilter.column, roleFilter.value);
      if (data.diretor_id) query = query.eq("diretor_profile_id", data.diretor_id);
      if (data.superintendente_id)
        query = query.eq("superintendente_profile_id", data.superintendente_id);
      if (data.gerente_id) query = query.eq("gerente_id", data.gerente_id);
      const { data: page, error } = await query.range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if ((page ?? []).length < 1000) break;
    }
    const directorIds = [
      ...new Set((rows ?? []).map((row: any) => row.diretor_profile_id).filter(Boolean)),
    ];
    const supIds = [
      ...new Set((rows ?? []).map((row: any) => row.superintendente_profile_id).filter(Boolean)),
    ];
    const gerenteIds = [...new Set((rows ?? []).map((row: any) => row.gerente_id).filter(Boolean))];
    const personIds = [
      ...new Set(
        (rows ?? [])
          .flatMap((row: any) => [
            row.diretor_pessoa_id,
            row.superintendente_pessoa_id,
            row.gerente_pessoa_id,
          ])
          .filter(Boolean),
      ),
    ];
    const [{ data: profiles }, { data: managers }, { data: people }] = await Promise.all([
      [...new Set([...directorIds, ...supIds])].length
        ? supabaseAdmin
            .from("profiles")
            .select("id,nome,email")
            .in("id", [...new Set([...directorIds, ...supIds])])
        : Promise.resolve({ data: [] }),
      gerenteIds.length
        ? supabaseAdmin.from("gerentes").select("id,nome").in("id", gerenteIds)
        : Promise.resolve({ data: [] }),
      personIds.length
        ? (supabaseAdmin as any).from("contabil_pessoas").select("id,nome").in("id", personIds)
        : Promise.resolve({ data: [] }),
    ]);
    const profileNames = new Map(
      (profiles ?? []).map((row: any) => [row.id, row.nome || row.email || "Sem nome"]),
    );
    const managerNames = new Map((managers ?? []).map((row: any) => [row.id, row.nome]));
    const personNames = new Map((people ?? []).map((row: any) => [row.id, row.nome]));
    const result = {
      quantidade: 0,
      vgv: 0,
      pvs: new Set<string>(),
      porDiretor: {} as Record<string, number>,
      porSup: {} as Record<string, number>,
      porGerente: {} as Record<string, number>,
      porPlantao: {} as Record<string, number>,
    };
    for (const row of rows ?? []) {
      const quantity = Number(row.quantidade || 0);
      result.quantidade += quantity;
      result.vgv += Number(row.vgv || 0);
      result.pvs.add(row.pv);
      const director =
        profileNames.get(row.diretor_profile_id) || personNames.get(row.diretor_pessoa_id);
      const sup =
        profileNames.get(row.superintendente_profile_id) ||
        personNames.get(row.superintendente_pessoa_id);
      const manager = managerNames.get(row.gerente_id) || personNames.get(row.gerente_pessoa_id);
      if (director) result.porDiretor[director] = (result.porDiretor[director] || 0) + quantity;
      if (sup) result.porSup[sup] = (result.porSup[sup] || 0) + quantity;
      if (manager) result.porGerente[manager] = (result.porGerente[manager] || 0) + quantity;
      if (row.plantao)
        result.porPlantao[row.plantao] = (result.porPlantao[row.plantao] || 0) + quantity;
    }
    return { ...result, pvs: result.pvs.size };
  });
