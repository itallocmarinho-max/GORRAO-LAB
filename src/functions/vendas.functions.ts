import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TokenInput = z.object({ token: z.string().min(1) });

async function assertAdmin(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", data.user.id);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Acesso negado");
  return data.user.id;
}

async function assertAuth(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  return data.user.id;
}

async function isAdminOrDiretor(userId: string): Promise<boolean> {
  const [{ data: roles }, { data: prof }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("profiles").select("cargo").eq("id", userId).maybeSingle(),
  ]);
  if (roles?.some((r) => r.role === "admin")) return true;
  if ((prof as any)?.cargo === "diretor") return true;
  return false;
}

async function assertPrevisaoOwner(userId: string, previsaoIds: string[]) {
  if (!previsaoIds.length) return;
  if (await isAdminOrDiretor(userId)) return;
  const { data: rows, error } = await supabaseAdmin
    .from("previsoes")
    .select("id, usuario_id")
    .in("id", previsaoIds);
  if (error) throw new Error(error.message);
  if (!rows || rows.length !== previsaoIds.length) {
    throw new Error("Previsão não encontrada");
  }
  for (const r of rows) {
    if ((r as any).usuario_id !== userId) {
      throw new Error("Acesso negado: previsão de outro usuário");
    }
  }
}

/** Bloqueia mutações para usuários com cargo = 'diretor' (somente leitura/validação). */
async function assertCanWrite(token: string): Promise<string> {
  const uid = await assertAuth(token);
  const { data: prof } = await supabaseAdmin
    .from("profiles").select("cargo").eq("id", uid).maybeSingle();
  if ((prof as any)?.cargo === "diretor") {
    throw new Error("Perfil Diretor é somente leitura: sem permissão para criar, editar ou excluir.");
  }
  return uid;
}

function normHier(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^gerente\s+/i, "")
    .replace(/\.$/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normProduto(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VendaRow = z.object({
  pv: z.string().trim().min(1).max(100),
  empreendimento: z.string().max(300).optional().nullable(),
  data_assinatura: z.string().optional().nullable(),
  superintendente: z.string().max(200).optional().nullable(),
  gerente: z.string().max(200).optional().nullable(),
  corretor: z.string().max(200).optional().nullable(),
  diretor: z.string().max(200).optional().nullable(),
  vgv: z.number().min(0).max(1e12).optional().nullable(),
  unidades: z.number().min(0).max(1000000).optional().nullable(),
  produto_id: z.string().uuid().optional().nullable(),
});

const BulkInput = z.object({
  token: z.string().min(1),
  rows: z.array(VendaRow).min(1),
});

export const vendasBulkImport = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => BulkInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const batchId = crypto.randomUUID();
    // Resolve aliases de produto pra preencher produto_id automaticamente quando vier vazio
    const { data: aliasRows } = await supabaseAdmin
      .from("previsao_produto_aliases")
      .select("alias_normalizado, produto_id");
    const aliasMap = new Map<string, string>();
    for (const a of aliasRows ?? []) aliasMap.set((a as any).alias_normalizado, (a as any).produto_id);
    const dedupMap = new Map<string, any>();
    for (const r of data.rows) {
      const pv = r.pv.trim();
      if (!pv) continue;
      let produto_id: string | null = r.produto_id ?? null;
      if (!produto_id && r.empreendimento) {
        const k = normProduto(r.empreendimento);
        if (k && aliasMap.has(k)) produto_id = aliasMap.get(k)!;
      }
      const row = {
        pv,
        empreendimento: r.empreendimento?.trim() || null,
        data_assinatura: r.data_assinatura || null,
        superintendente: r.superintendente?.trim() || null,
        gerente: r.gerente?.trim() || null,
        corretor: r.corretor?.trim() || null,
        diretor: r.diretor?.trim() || null,
        vgv: r.vgv ?? 0,
        unidades: r.unidades ?? 1,
        produto_id,
        import_batch_id: batchId,
        created_by: userId,
      };
      const existing = dedupMap.get(pv);
      dedupMap.set(pv, existing ? { ...row, unidades: Number(existing.unidades || 0) + Number(row.unidades || 0) } : row);
    }
    const payload = Array.from(dedupMap.values());
    const CHUNK = 500;
    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error, data: ret } = await supabaseAdmin
        .from("vendas_realizadas")
        .upsert(slice as never, { onConflict: "pv" })
        .select("id");
      if (error) throw new Error(error.message);
      inserted += ret?.length ?? 0;
    }
    return { total: payload.length, inserted, updated, batch_id: batchId };
  });

export const vendasList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAuth(data.token);

    // load vendas (paginated)
    const vendas: any[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: page, error } = await supabaseAdmin
        .from("vendas_realizadas")
        .select("*")
        .order("data_assinatura", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      vendas.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    // previsoes
    const { data: previsoes, error: pErr } = await supabaseAdmin
      .from("previsoes")
      .select("id, superintendente, gerente, produto_id, semana_inicio, semana_fim, mes_referencia, ano_referencia, preciso_vendas, realizado, observacao");
    if (pErr) throw new Error(pErr.message);

    // produtos cadastrados
    const { data: produtos } = await supabaseAdmin
      .from("previsao_produtos")
      .select("id, nome, ativo");

    // hierarchy aliases (same mechanism as leads)
    const [{ data: aliases }, { data: profs }, { data: gers }] = await Promise.all([
      supabaseAdmin.from("leads_hierarquia_aliases").select("tipo, alias_normalizado, profile_id, gerente_id"),
      supabaseAdmin.from("profiles").select("id, nome, email"),
      supabaseAdmin.from("gerentes").select("id, nome, superintendente_id"),
    ]);
    // produto aliases — resolve produto_id por empreendimento quando a venda não tiver produto setado
    const { data: prodAliases } = await supabaseAdmin
      .from("previsao_produto_aliases")
      .select("alias_normalizado, produto_id");
    const prodByEmpNorm = new Map<string, string>();
    for (const a of prodAliases ?? []) {
      const row = a as any;
      if (row.alias_normalizado && row.produto_id) prodByEmpNorm.set(row.alias_normalizado, row.produto_id);
    }
    const profName = new Map<string, string>();
    for (const p of profs ?? []) profName.set((p as any).id, (p as any).nome || (p as any).email || "");
    const gerInfo = new Map<string, { nome: string; sup_id: string }>();
    for (const g of gers ?? []) gerInfo.set((g as any).id, { nome: (g as any).nome || "", sup_id: (g as any).superintendente_id });
    const supByNorm = new Map<string, string>(); // norm -> sup name
    const gerByNorm = new Map<string, { nome: string; sup_nome: string | null }>();
    for (const a of aliases ?? []) {
      const row = a as any;
      if (row.tipo === "superintendente" && row.profile_id) {
        const n = profName.get(row.profile_id);
        if (n) supByNorm.set(row.alias_normalizado, n);
      } else if (row.tipo === "gerente" && row.gerente_id) {
        const g = gerInfo.get(row.gerente_id);
        if (g) gerByNorm.set(row.alias_normalizado, { nome: g.nome, sup_nome: g.sup_id ? (profName.get(g.sup_id) ?? null) : null });
      }
    }

    const vendasResolved = vendas.map((v) => {
      const out = { ...v };
      if (v.superintendente) {
        const r = supByNorm.get(normHier(String(v.superintendente)));
        if (r) out.superintendente = r;
      }
      if (v.gerente) {
        const r = gerByNorm.get(normHier(String(v.gerente)));
        if (r) {
          out.gerente = r.nome;
          if (r.sup_nome) out.superintendente = r.sup_nome;
        }
      }
      if (!out.produto_id && v.empreendimento) {
        const pid = prodByEmpNorm.get(normProduto(String(v.empreendimento)));
        if (pid) out.produto_id = pid;
      }
      return out;
    });

    const previsoesResolved = (previsoes ?? []).map((p: any) => {
      const out = { ...p };
      if (p.superintendente) {
        const r = supByNorm.get(normHier(String(p.superintendente)));
        if (r) out.superintendente = r;
      }
      if (p.gerente) {
        const r = gerByNorm.get(normHier(String(p.gerente)));
        if (r) out.gerente = r.nome;
      }
      return out;
    });

    return { vendas: vendasResolved, previsoes: previsoesResolved, produtos: produtos ?? [] };
  });

export const vendasClearAll = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { error } = await supabaseAdmin.from("vendas_realizadas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Bases importadas (batches) ============
export const vendasBatchesList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    // Aggregate batches from vendas_realizadas
    const out: Record<string, { id: string; created_at: string; total: number; vgv: number; unidades: number; created_by: string | null }> = {};
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: page, error } = await supabaseAdmin
        .from("vendas_realizadas")
        .select("import_batch_id, created_at, vgv, unidades, created_by")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      for (const r of page as any[]) {
        const id = r.import_batch_id ?? "__sem_lote__";
        if (!out[id]) out[id] = { id, created_at: r.created_at, total: 0, vgv: 0, unidades: 0, created_by: r.created_by ?? null };
        out[id].total += 1;
        out[id].vgv += Number(r.vgv || 0);
        out[id].unidades += Number(r.unidades || 0);
        if (r.created_at < out[id].created_at) out[id].created_at = r.created_at;
      }
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return Object.values(out).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  });

const BatchDeleteInput = z.object({ token: z.string().min(1), batch_id: z.string().min(1) });
export const vendasBatchDelete = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => BatchDeleteInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const q = supabaseAdmin.from("vendas_realizadas").delete({ count: "exact" });
    const { error, count } = data.batch_id === "__sem_lote__"
      ? await q.is("import_batch_id", null)
      : await q.eq("import_batch_id", data.batch_id);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

// ============ Vínculo (hierarquia) — distinct names from vendas ============
export const vendasHierarquiaList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);

    const [{ data: profs }, { data: gers }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, nome, email, cargo, diretor_id").in("cargo", ["superintendente"]),
      supabaseAdmin.from("gerentes").select("id, nome, superintendente_id, ativo"),
    ]);

    const { data: aliases } = await supabaseAdmin
      .from("leads_hierarquia_aliases")
      .select("id, tipo, alias, alias_normalizado, profile_id, gerente_id");

    async function fetchAllDistinct(col: "superintendente" | "gerente"): Promise<string[]> {
      const out: string[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data: page, error } = await supabaseAdmin
          .from("vendas_realizadas")
          .select(col)
          .not(col, "is", null)
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        if (!page || page.length === 0) break;
        for (const r of page) {
          const v = (r as any)[col];
          if (v != null) out.push(String(v));
        }
        if (page.length < pageSize) break;
        from += pageSize;
      }
      return out;
    }
    const [supVals, gerVals] = await Promise.all([fetchAllDistinct("superintendente"), fetchAllDistinct("gerente")]);

    const supSet = new Map<string, string>();
    for (const v of supVals) {
      const raw = v.trim();
      if (!raw) continue;
      const norm = normHier(raw);
      if (norm && !supSet.has(norm)) supSet.set(norm, raw);
    }
    const gerSet = new Map<string, string>();
    for (const v of gerVals) {
      const raw = v.trim();
      if (!raw) continue;
      const norm = normHier(raw);
      if (norm && !gerSet.has(norm)) gerSet.set(norm, raw);
    }

    const profByNorm = new Map<string, string>();
    for (const p of profs ?? []) profByNorm.set(normHier((p as any).nome ?? ""), (p as any).id);
    const gerByNorm = new Map<string, string>();
    for (const g of gers ?? []) gerByNorm.set(normHier((g as any).nome ?? ""), (g as any).id);

    const aliasByKey = new Map<string, any>();
    for (const a of aliases ?? []) aliasByKey.set(`${(a as any).tipo}:${(a as any).alias_normalizado}`, a);

    const sups = Array.from(supSet.entries()).map(([norm, alias]) => {
      const existing = aliasByKey.get(`superintendente:${norm}`);
      const suggested = existing ? null : (profByNorm.get(norm) ?? null);
      return {
        alias,
        alias_normalizado: norm,
        profile_id: existing?.profile_id ?? null,
        suggested_profile_id: suggested,
        alias_row_id: existing?.id ?? null,
      };
    }).sort((a, b) => a.alias.localeCompare(b.alias, "pt-BR"));

    const gerentes = Array.from(gerSet.entries()).map(([norm, alias]) => {
      const existing = aliasByKey.get(`gerente:${norm}`);
      const suggested = existing ? null : (gerByNorm.get(norm) ?? null);
      return {
        alias,
        alias_normalizado: norm,
        gerente_id: existing?.gerente_id ?? null,
        suggested_gerente_id: suggested,
        alias_row_id: existing?.id ?? null,
      };
    }).sort((a, b) => a.alias.localeCompare(b.alias, "pt-BR"));

    return {
      sups,
      gerentes,
      profiles: (profs ?? []).map((p: any) => ({ id: p.id, nome: p.nome || p.email, diretor_id: p.diretor_id })),
      gerentesCadastro: (gers ?? []).map((g: any) => ({ id: g.id, nome: g.nome, superintendente_id: g.superintendente_id })),
    };
  });

// ============ Previsão (forecast) — list sups + create ============
export const previsaoSupsList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAuth(data.token);
    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, email, cargo")
      .in("cargo", ["superintendente"]);
    if (error) throw new Error(error.message);
    return (profs ?? []).map((p: any) => ({ id: p.id, nome: p.nome || p.email || "" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });

const PrevisaoCreateInput = z.object({
  token: z.string().min(1),
  superintendente: z.string().trim().min(1).max(200),
  mes_referencia: z.number().int().min(1).max(12),
  ano_referencia: z.number().int().min(2000).max(2100),
  semana_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  semana_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preciso_vendas: z.number().min(0).max(1e9),
  observacao: z.string().max(1000).optional().nullable(),
});

export const previsaoCreate = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PrevisaoCreateInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAuth(data.token);
    await assertCanWrite(data.token);
    const { error } = await supabaseAdmin.from("previsoes").insert({
      usuario_id: userId,
      superintendente: data.superintendente,
      mes_referencia: data.mes_referencia,
      ano_referencia: data.ano_referencia,
      semana_inicio: data.semana_inicio,
      semana_fim: data.semana_fim,
      preciso_vendas: data.preciso_vendas,
      observacao: data.observacao ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PrevisaoDeleteInput = z.object({ token: z.string().min(1), id: z.string().uuid() });
export const previsaoDelete = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PrevisaoDeleteInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAuth(data.token);
    await assertCanWrite(data.token);
    await assertPrevisaoOwner(userId, [data.id]);
    const { error } = await supabaseAdmin.from("previsoes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Gerentes de um superintendente ============
const PrevisaoGerentesInput = z.object({ token: z.string().min(1), superintendente_id: z.string().uuid() });
export const previsaoGerentesList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PrevisaoGerentesInput.parse(i))
  .handler(async ({ data }) => {
    await assertAuth(data.token);
    const { data: gers, error } = await supabaseAdmin
      .from("gerentes")
      .select("id, nome, ativo")
      .eq("superintendente_id", data.superintendente_id)
      .eq("ativo", true)
      .order("nome");
    if (error) throw new Error(error.message);
    return (gers ?? []).map((g: any) => ({ id: g.id, nome: g.nome }));
  });

// ============ Previsão em massa (vários gerentes na mesma semana) ============
const PrevisaoBulkInput = z.object({
  token: z.string().min(1),
  superintendente: z.string().trim().min(1).max(200),
  mes_referencia: z.number().int().min(1).max(12),
  ano_referencia: z.number().int().min(2000).max(2100),
  semana_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  semana_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacao: z.string().max(1000).optional().nullable(),
  itens: z.array(z.object({
    gerente: z.string().trim().min(1).max(200),
    preciso_vendas: z.number().min(0).max(1e9),
  })).min(1).max(200),
});
export const previsaoCreateBulk = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PrevisaoBulkInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAuth(data.token);
    await assertCanWrite(data.token);
    const rows = data.itens
      .filter((it) => it.preciso_vendas > 0)
      .map((it) => ({
        usuario_id: userId,
        superintendente: data.superintendente,
        gerente: it.gerente,
        mes_referencia: data.mes_referencia,
        ano_referencia: data.ano_referencia,
        semana_inicio: data.semana_inicio,
        semana_fim: data.semana_fim,
        preciso_vendas: it.preciso_vendas,
        observacao: data.observacao ?? null,
      }));
    if (!rows.length) throw new Error("Informe ao menos uma quantidade > 0");
    const { error } = await supabaseAdmin.from("previsoes").insert(rows as never);
    if (error) throw new Error(error.message);
    return { ok: true, total: rows.length };
  });

// ============ Editar previsão ============
const PrevisaoUpdateInput = z.object({
  token: z.string().min(1),
  id: z.string().uuid(),
  preciso_vendas: z.number().min(0).max(1e9),
  gerente: z.string().trim().max(200).optional().nullable(),
  observacao: z.string().max(1000).optional().nullable(),
});
export const previsaoUpdate = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PrevisaoUpdateInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAuth(data.token);
    await assertCanWrite(data.token);
    await assertPrevisaoOwner(userId, [data.id]);
    const patch: any = { preciso_vendas: data.preciso_vendas, observacao: data.observacao ?? null };
    if (data.gerente !== undefined) patch.gerente = data.gerente?.trim() || null;
    const { error } = await supabaseAdmin.from("previsoes").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Produtos da Previsão ============
export const produtosPrevisaoList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAuth(data.token);
    const [{ data: produtos }, { data: aliases }, { data: previsoesCnt }] = await Promise.all([
      supabaseAdmin.from("previsao_produtos").select("id, nome, ativo, created_at").order("nome"),
      supabaseAdmin.from("previsao_produto_aliases").select("id, produto_id, alias, alias_normalizado, vezes_usado"),
      supabaseAdmin.from("previsoes").select("produto_id"),
    ]);
    const aliasByProd = new Map<string, any[]>();
    for (const a of aliases ?? []) {
      const k = (a as any).produto_id;
      if (!aliasByProd.has(k)) aliasByProd.set(k, []);
      aliasByProd.get(k)!.push(a);
    }
    const cntByProd = new Map<string, number>();
    for (const p of previsoesCnt ?? []) {
      const k = (p as any).produto_id;
      if (!k) continue;
      cntByProd.set(k, (cntByProd.get(k) ?? 0) + 1);
    }
    return (produtos ?? []).map((p: any) => ({
      ...p,
      aliases: aliasByProd.get(p.id) ?? [],
      previsoes_count: cntByProd.get(p.id) ?? 0,
    }));
  });

const ProdutoCreateInput = z.object({
  token: z.string().min(1),
  nome: z.string().trim().min(1).max(200),
});
export const produtoPrevisaoCreate = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProdutoCreateInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const nome = data.nome.trim();
    const norm = normProduto(nome);
    if (!norm) throw new Error("Nome inválido");
    const { data: ex } = await supabaseAdmin
      .from("previsao_produtos")
      .select("id")
      .eq("nome_normalizado", norm)
      .maybeSingle();
    if (ex) return { id: (ex as any).id, already: true };
    const { data: created, error } = await supabaseAdmin
      .from("previsao_produtos")
      .insert({ nome, nome_normalizado: norm } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (created as any).id, already: false };
  });

const ProdutoToggleInput = z.object({
  token: z.string().min(1),
  id: z.string().uuid(),
  ativo: z.boolean(),
});
export const produtoPrevisaoToggleAtivo = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProdutoToggleInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { error } = await supabaseAdmin
      .from("previsao_produtos")
      .update({ ativo: data.ativo } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ProdutoDeleteInput = z.object({ token: z.string().min(1), id: z.string().uuid() });
export const produtoPrevisaoDelete = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProdutoDeleteInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { error } = await supabaseAdmin
      .from("previsao_produtos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ProdutoAliasUpsertInput = z.object({
  token: z.string().min(1),
  produto_id: z.string().uuid(),
  alias: z.string().trim().min(1).max(300),
});
export const produtoAliasUpsert = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProdutoAliasUpsertInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const alias = data.alias.trim();
    const norm = normProduto(alias);
    if (!norm) throw new Error("Alias inválido");
    const { error } = await supabaseAdmin
      .from("previsao_produto_aliases")
      .upsert(
        { produto_id: data.produto_id, alias, alias_normalizado: norm, created_by: userId } as never,
        { onConflict: "alias_normalizado" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ProdutoAliasDeleteInput = z.object({ token: z.string().min(1), id: z.string().uuid() });
export const produtoAliasDelete = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProdutoAliasDeleteInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { error } = await supabaseAdmin
      .from("previsao_produto_aliases")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ProdutoSugerirInput = z.object({
  token: z.string().min(1),
  nomes: z.array(z.string().min(1).max(300)).min(1).max(2000),
});
export const produtoAliasesSugerir = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProdutoSugerirInput.parse(i))
  .handler(async ({ data }) => {
    await assertAuth(data.token);
    const [{ data: produtos }, { data: aliases }] = await Promise.all([
      supabaseAdmin.from("previsao_produtos").select("id, nome, nome_normalizado, ativo"),
      supabaseAdmin.from("previsao_produto_aliases").select("alias_normalizado, produto_id"),
    ]);
    const byAlias = new Map<string, string>();
    for (const a of aliases ?? []) byAlias.set((a as any).alias_normalizado, (a as any).produto_id);
    const byNome = new Map<string, string>();
    for (const p of produtos ?? []) byNome.set((p as any).nome_normalizado, (p as any).id);

    const out: { nome: string; norm: string; produto_id: string | null; suggested_produto_id: string | null }[] = [];
    const seen = new Set<string>();
    for (const raw of data.nomes) {
      const nome = raw.trim();
      if (!nome) continue;
      const norm = normProduto(nome);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const matched = byAlias.get(norm) ?? null;
      const suggested = matched ? null : byNome.get(norm) ?? null;
      out.push({ nome, norm, produto_id: matched, suggested_produto_id: suggested });
    }
    return { items: out, produtos: (produtos ?? []).map((p: any) => ({ id: p.id, nome: p.nome, ativo: p.ativo })) };
  });

// ============ Solicitações de novos produtos (validação admin) ============
const SolicitarProdutoInput = z.object({
  token: z.string().min(1),
  nome: z.string().trim().min(1).max(200),
  justificativa: z.string().trim().max(1000).optional().nullable(),
});
export const produtoSolicitar = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SolicitarProdutoInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAuth(data.token);
    await assertCanWrite(data.token);
    const nome = data.nome.trim();
    const norm = normProduto(nome);
    if (!norm) throw new Error("Nome inválido");
    // Se já existe produto com esse nome normalizado, retorna direto
    const { data: existProd } = await supabaseAdmin
      .from("previsao_produtos")
      .select("id")
      .eq("nome_normalizado", norm)
      .maybeSingle();
    if (existProd) return { ok: true, already_exists: true, produto_id: (existProd as any).id };
    // Se já existe solicitação pendente com mesmo nome desse usuário, evita duplicar
    const { data: existSol } = await supabaseAdmin
      .from("previsao_produto_solicitacoes")
      .select("id, status")
      .eq("nome_solicitado", nome)
      .eq("solicitado_por", userId)
      .eq("status", "pendente")
      .maybeSingle();
    if (existSol) return { ok: true, already_requested: true, solicitacao_id: (existSol as any).id };
    const { data: created, error } = await supabaseAdmin
      .from("previsao_produto_solicitacoes")
      .insert({
        nome_solicitado: nome,
        justificativa: data.justificativa?.trim() || null,
        solicitado_por: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, solicitacao_id: (created as any).id };
  });

export const produtoSolicitacoesList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("previsao_produto_solicitacoes")
      .select("id, nome_solicitado, justificativa, status, solicitado_por, revisado_por, revisado_em, motivo_rejeicao, produto_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Resolver nomes dos solicitantes
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.solicitado_por).filter(Boolean)));
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, nome, email")
        .in("id", ids);
      for (const p of profs ?? []) nameById.set((p as any).id, (p as any).nome || (p as any).email || "");
    }
    return (rows ?? []).map((r: any) => ({ ...r, solicitante_nome: nameById.get(r.solicitado_por) ?? "—" }));
  });

const SolicAprovarInput = z.object({ token: z.string().min(1), id: z.string().uuid() });
export const produtoSolicitacaoAprovar = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SolicAprovarInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const { data: sol, error: sErr } = await supabaseAdmin
      .from("previsao_produto_solicitacoes")
      .select("id, nome_solicitado, status")
      .eq("id", data.id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sol) throw new Error("Solicitação não encontrada");
    if ((sol as any).status !== "pendente") throw new Error("Solicitação já processada");
    const nome = (sol as any).nome_solicitado.trim();
    const norm = normProduto(nome);
    let produtoId: string | null = null;
    const { data: existProd } = await supabaseAdmin
      .from("previsao_produtos")
      .select("id")
      .eq("nome_normalizado", norm)
      .maybeSingle();
    if (existProd) produtoId = (existProd as any).id;
    else {
      const { data: created, error: cErr } = await supabaseAdmin
        .from("previsao_produtos")
        .insert({ nome, nome_normalizado: norm } as never)
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);
      produtoId = (created as any).id;
    }
    const { error: uErr } = await supabaseAdmin
      .from("previsao_produto_solicitacoes")
      .update({ status: "aprovado", produto_id: produtoId, revisado_por: userId, revisado_em: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, produto_id: produtoId };
  });

const SolicRejeitarInput = z.object({
  token: z.string().min(1),
  id: z.string().uuid(),
  motivo: z.string().trim().max(500).optional().nullable(),
});
export const produtoSolicitacaoRejeitar = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SolicRejeitarInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const { error } = await supabaseAdmin
      .from("previsao_produto_solicitacoes")
      .update({
        status: "rejeitado",
        motivo_rejeicao: data.motivo?.trim() || null,
        revisado_por: userId,
        revisado_em: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .eq("status", "pendente");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Grupo de previsão (editar tudo como criação) ============
const PrevisaoGroupGetInput = z.object({
  token: z.string().min(1),
  superintendente: z.string().trim().min(1).max(200),
  semana_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const previsaoGroupGet = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PrevisaoGroupGetInput.parse(i))
  .handler(async ({ data }) => {
    await assertAuth(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("previsoes")
      .select("id, superintendente, gerente, produto_id, semana_inicio, semana_fim, mes_referencia, ano_referencia, preciso_vendas, observacao")
      .eq("superintendente", data.superintendente)
      .eq("semana_inicio", data.semana_inicio);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const PrevisaoGroupUpsertInput = z.object({
  token: z.string().min(1),
  superintendente: z.string().trim().min(1).max(200),
  semana_inicio_original: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  semana_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  semana_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mes_referencia: z.number().int().min(1).max(12),
  ano_referencia: z.number().int().min(2000).max(2100),
  observacao: z.string().max(1000).optional().nullable(),
  delete_ids: z.array(z.string().uuid()).optional(),
  itens: z.array(z.object({
    id: z.string().uuid().optional().nullable(),
    produto_id: z.string().uuid().optional().nullable(),
    gerente: z.string().trim().max(200).optional().nullable(),
    preciso_vendas: z.number().min(0).max(1e9),
  })).max(500),
});
export const previsaoGroupUpsert = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PrevisaoGroupUpsertInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAuth(data.token);
    await assertCanWrite(data.token);
    // Verificar ownership de todos os ids envolvidos em mutação
    const idsParaChecar = [
      ...(data.delete_ids ?? []),
      ...data.itens.filter((it) => it.id).map((it) => it.id!),
    ];
    await assertPrevisaoOwner(userId, idsParaChecar);
    // Excluir os marcados
    if (data.delete_ids && data.delete_ids.length) {
      const { error } = await supabaseAdmin
        .from("previsoes")
        .delete()
        .in("id", data.delete_ids);
      if (error) throw new Error(error.message);
    }
    const base = {
      superintendente: data.superintendente,
      semana_inicio: data.semana_inicio,
      semana_fim: data.semana_fim,
      mes_referencia: data.mes_referencia,
      ano_referencia: data.ano_referencia,
      observacao: data.observacao ?? null,
    };
    // Update existentes (mantém usuario_id original) — só editamos campos do form
    const toUpdate = data.itens.filter((it) => it.id && it.preciso_vendas > 0);
    for (const it of toUpdate) {
      const { error } = await supabaseAdmin
        .from("previsoes")
        .update({
          ...base,
          gerente: it.gerente?.trim() || null,
          produto_id: it.produto_id ?? null,
          preciso_vendas: it.preciso_vendas,
        } as never)
        .eq("id", it.id!);
      if (error) throw new Error(error.message);
    }
    // Inserir novos
    const toInsert = data.itens
      .filter((it) => !it.id && it.preciso_vendas > 0)
      .map((it) => ({
        usuario_id: userId,
        ...base,
        gerente: it.gerente?.trim() || null,
        produto_id: it.produto_id ?? null,
        preciso_vendas: it.preciso_vendas,
      }));
    if (toInsert.length) {
      const { error } = await supabaseAdmin.from("previsoes").insert(toInsert as never);
      if (error) throw new Error(error.message);
    }
    // Itens com qtd 0 e id existente => excluir (limpou)
    const toDeleteZero = data.itens.filter((it) => it.id && it.preciso_vendas <= 0).map((it) => it.id!);
    if (toDeleteZero.length) {
      const { error } = await supabaseAdmin.from("previsoes").delete().in("id", toDeleteZero);
      if (error) throw new Error(error.message);
    }
    return { ok: true, inserted: toInsert.length, updated: toUpdate.length, deleted: (data.delete_ids?.length ?? 0) + toDeleteZero.length };
  });