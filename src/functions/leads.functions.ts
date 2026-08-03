import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TokenInput = z.object({ token: z.string().min(1) });

const ClassifyInput = z.object({
  token: z.string().min(1),
  nome: z.string().trim().min(1).max(500),
  campanha: z.string().max(500).optional().nullable(),
  formulario: z.string().max(500).optional().nullable(),
  payload: z.any().optional(),
  gerente: z.string().max(200).optional().nullable(),
  superintendente: z.string().max(200).optional().nullable(),
  fonte: z.string().max(200).optional().nullable(),
  canal: z.string().max(200).optional().nullable(),
  responsavel: z.string().max(200).optional().nullable(),
  created_at: z.string().optional().nullable(),
});

const ConfirmInput = z.object({
  token: z.string().min(1),
  lead_id: z.string().uuid(),
  produto_id: z.string().uuid(),
  criar_alias: z.boolean().default(true),
});

const NovoProdutoInput = z.object({
  token: z.string().min(1),
  lead_id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(200),
  descricao: z.string().max(500).optional().nullable(),
});

const NovoAliasInput = z.object({
  token: z.string().min(1),
  produto_id: z.string().uuid(),
  alias: z.string().trim().min(1).max(200),
});

const MarcarIndefinidoInput = z.object({
  token: z.string().min(1),
  lead_id: z.string().uuid(),
});

const ListInput = z.object({
  token: z.string().min(1),
  status: z.enum(["pendente", "aprovado_auto", "aprovado_manual", "indefinido", "todos"]).default("todos"),
});

async function assertAdmin(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Acesso negado");
  return data.user.id;
}

/** Bloqueia mutações para usuários com cargo = 'diretor' (somente leitura/validação). */
async function assertCanWrite(token: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const { data: prof } = await supabaseAdmin
    .from("profiles").select("cargo").eq("id", data.user.id).maybeSingle();
  if ((prof as any)?.cargo === "diretor") {
    throw new Error("Perfil Diretor é somente leitura: sem permissão para criar, editar ou excluir.");
  }
  return data.user.id;
}

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match algorithm:
 * 1) exact alias normalized → score 1.0
 * 2) exact produto normalized → score 1.0
 * 3) pg_trgm similarity against aliases & produtos → max wins
 */
async function matchProduto(nomeNorm: string): Promise<{ produto_id: string | null; score: number }> {
  // exact alias
  const { data: aliasExact } = await supabaseAdmin
    .from("produto_aliases")
    .select("produto_id")
    .eq("alias_normalizado", nomeNorm)
    .maybeSingle();
  if (aliasExact?.produto_id) return { produto_id: aliasExact.produto_id, score: 1 };

  const { data: prodExact } = await supabaseAdmin
    .from("produtos_oficiais")
    .select("id")
    .eq("nome_normalizado", nomeNorm)
    .eq("ativo", true)
    .maybeSingle();
  if (prodExact?.id) return { produto_id: prodExact.id, score: 1 };

  // similarity scan (small cardinality expected)
  const [{ data: produtos }, { data: aliases }] = await Promise.all([
    supabaseAdmin.from("produtos_oficiais").select("id, nome_normalizado").eq("ativo", true),
    supabaseAdmin.from("produto_aliases").select("produto_id, alias_normalizado"),
  ]);

  let best: { produto_id: string | null; score: number } = { produto_id: null, score: 0 };
  const score = (a: string, b: string) => trigramSimilarity(a, b);

  for (const p of produtos ?? []) {
    const s = score(nomeNorm, p.nome_normalizado);
    if (s > best.score) best = { produto_id: p.id, score: s };
  }
  for (const a of aliases ?? []) {
    const s = score(nomeNorm, a.alias_normalizado);
    if (s > best.score) best = { produto_id: a.produto_id, score: s };
  }
  return best;
}

// Trigram-style Jaccard similarity (approximates pg_trgm similarity())
function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const trig = (s: string) => {
    const padded = `  ${s} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    return set;
  };
  const A = trig(a);
  const B = trig(b);
  let inter = 0;
  A.forEach((t) => { if (B.has(t)) inter++; });
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const leadsClassify = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ClassifyInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const norm = normalize(data.nome);
    const match = await matchProduto(norm);

    let status: string;
    let produto_id: string | null = null;
    let produto_sugerido_id: string | null = null;
    let origem: string | null = null;

    if (match.score >= 0.9 && match.produto_id) {
      status = "aprovado_auto";
      produto_id = match.produto_id;
      origem = "automatica";
    } else if (match.score >= 0.7 && match.produto_id) {
      status = "pendente";
      produto_sugerido_id = match.produto_id;
    } else {
      status = "indefinido";
      produto_sugerido_id = match.produto_id;
    }

    const { data: lead, error } = await supabaseAdmin
      .from("leads_facebook")
      .insert({
        nome_original: data.nome,
        nome_normalizado: norm,
        campanha: data.campanha ?? null,
        formulario: data.formulario ?? null,
        payload: data.payload ?? null,
        produto_id,
        produto_sugerido_id,
        score: Number(match.score.toFixed(4)),
        status,
        origem_decisao: origem,
        decidido_em: status === "aprovado_auto" ? new Date().toISOString() : null,
        gerente: data.gerente ?? null,
        superintendente: data.superintendente ?? null,
        fonte: data.fonte ?? null,
        canal: data.canal ?? null,
        responsavel: data.responsavel ?? null,
        ...(data.created_at ? { created_at: data.created_at } : {}),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (status === "aprovado_auto" && produto_id) {
      await supabaseAdmin
        .from("leads_decisoes")
        .insert({ lead_id: lead.id, acao: "classificou_auto", produto_id, score: lead.score, origem: "automatica" });
    } else if (status === "indefinido") {
      await supabaseAdmin
        .from("leads_decisoes")
        .insert({ lead_id: lead.id, acao: "marcou_indefinido", score: lead.score, origem: "automatica" });
    }

    return { lead };
  });

const BulkRow = z.object({
  nome: z.string().trim().min(1).max(500),
  gerente: z.string().max(200).optional().nullable(),
  superintendente: z.string().max(200).optional().nullable(),
  fonte: z.string().max(200).optional().nullable(),
  canal: z.string().max(200).optional().nullable(),
  responsavel: z.string().max(200).optional().nullable(),
  created_at: z.string().optional().nullable(),
  contagem: z.number().int().min(0).max(1000000).optional().nullable(),
});

const BulkInput = z.object({
  token: z.string().min(1),
  rows: z.array(BulkRow).min(1),
  arquivo_nome: z.string().max(300).optional().nullable(),
  batch_id: z.string().uuid().optional().nullable(),
});

export const leadsBulkImport = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => BulkInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    let batchId = data.batch_id ?? null;
    if (!batchId) {
      const { data: batch, error: batchErr } = await supabaseAdmin
        .from("leads_import_batches")
        .insert({ created_by: userId, arquivo_nome: data.arquivo_nome ?? null, total: 0, auto: 0, pendente: 0, indefinido: 0, erros: 0 })
        .select("id")
        .single();
      if (batchErr || !batch) throw new Error(batchErr?.message ?? "Falha ao criar lote");
      batchId = batch.id;
    }
    let auto = 0, pendente = 0, indef = 0, erros = 0;
    // Pré-carrega produtos e aliases UMA VEZ por chunk (em vez de por linha)
    const [{ data: produtosList }, { data: aliasesList }] = await Promise.all([
      supabaseAdmin.from("produtos_oficiais").select("id, nome_normalizado").eq("ativo", true),
      supabaseAdmin.from("produto_aliases").select("produto_id, alias_normalizado"),
    ]);
    const prodByNorm = new Map<string, string>();
    (produtosList ?? []).forEach((p: any) => prodByNorm.set(p.nome_normalizado, p.id));
    const aliasByNorm = new Map<string, string>();
    (aliasesList ?? []).forEach((a: any) => aliasByNorm.set(a.alias_normalizado, a.produto_id));

    const matchLocal = (nomeNorm: string): { produto_id: string | null; score: number } => {
      const ax = aliasByNorm.get(nomeNorm);
      if (ax) return { produto_id: ax, score: 1 };
      const px = prodByNorm.get(nomeNorm);
      if (px) return { produto_id: px, score: 1 };
      let best: { produto_id: string | null; score: number } = { produto_id: null, score: 0 };
      for (const [norm, id] of prodByNorm) {
        const s = trigramSimilarity(nomeNorm, norm);
        if (s > best.score) best = { produto_id: id, score: s };
      }
      for (const [norm, id] of aliasByNorm) {
        const s = trigramSimilarity(nomeNorm, norm);
        if (s > best.score) best = { produto_id: id, score: s };
      }
      return best;
    };

    const toInsert: any[] = [];
    for (const row of data.rows) {
      const norm = normalize(row.nome);
      const match = matchLocal(norm);
      let status: string;
      let produto_id: string | null = null;
      let produto_sugerido_id: string | null = null;
      let origem: string | null = null;
      if (match.score >= 0.9 && match.produto_id) {
        status = "aprovado_auto"; produto_id = match.produto_id; origem = "automatica"; auto++;
      } else if (match.score >= 0.7 && match.produto_id) {
        status = "pendente"; produto_sugerido_id = match.produto_id; pendente++;
      } else {
        status = "indefinido"; produto_sugerido_id = match.produto_id; indef++;
      }
      toInsert.push({
        nome_original: row.nome,
        nome_normalizado: norm,
        gerente: row.gerente ?? null,
        superintendente: row.superintendente ?? null,
        fonte: row.fonte ?? null,
        canal: row.canal ?? null,
        responsavel: row.responsavel ?? null,
        produto_id,
        produto_sugerido_id,
        score: Number(match.score.toFixed(4)),
        status,
        origem_decisao: origem,
        decidido_em: status === "aprovado_auto" ? new Date().toISOString() : null,
        import_batch_id: batchId,
        contagem: row.contagem ?? 1,
        ...(row.created_at ? { created_at: row.created_at } : {}),
      });
    }

    // Insert em lotes de 200
    const INS = 200;
    for (let i = 0; i < toInsert.length; i += INS) {
      const slice = toInsert.slice(i, i + INS);
      const { error: insErr } = await supabaseAdmin.from("leads_facebook").insert(slice as never);
      if (insErr) {
        erros += slice.length;
        // ajusta contadores conforme o status das linhas com falha
        for (const r of slice) {
          if (r.status === "aprovado_auto") auto--;
          else if (r.status === "pendente") pendente--;
          else if (r.status === "indefinido") indef--;
        }
      }
    }

    const { data: cur } = await supabaseAdmin
      .from("leads_import_batches")
      .select("total, auto, pendente, indefinido, erros")
      .eq("id", batchId)
      .maybeSingle();
    const tot = (cur?.total ?? 0) + data.rows.length;
    const a = (cur?.auto ?? 0) + auto;
    const p = (cur?.pendente ?? 0) + pendente;
    const i = (cur?.indefinido ?? 0) + indef;
    const e = (cur?.erros ?? 0) + erros;
    await supabaseAdmin
      .from("leads_import_batches")
      .update({ total: tot, auto: a, pendente: p, indefinido: i, erros: e })
      .eq("id", batchId);
    return { batch_id: batchId, total: data.rows.length, auto, pendente, indef, erros };
  });

export const leadsImportBatchesList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { data: batches, error } = await supabaseAdmin
      .from("leads_import_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return batches ?? [];
  });

export const leadsImportBatchDelete = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string(), batch_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { error: lErr, count } = await supabaseAdmin
      .from("leads_facebook")
      .delete({ count: "exact" })
      .eq("import_batch_id", data.batch_id);
    if (lErr) throw new Error(lErr.message);
    const { error: bErr } = await supabaseAdmin
      .from("leads_import_batches")
      .delete()
      .eq("id", data.batch_id);
    if (bErr) throw new Error(bErr.message);
    return { ok: true, deleted: count ?? 0 };
  });

export const leadsList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ListInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const all: any[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      let q = supabaseAdmin
        .from("leads_facebook")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (data.status !== "todos") q = q.eq("status", data.status);
      const { data: page, error } = await q;
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      all.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    const leads = all;
    const { data: produtos } = await supabaseAdmin
      .from("produtos_oficiais")
      .select("id, nome, ativo")
      .order("nome");

    // Resolução de hierarquia: substitui nomes brutos pelo nome do usuário/gerente vinculado.
    const [{ data: aliases }, { data: profs }, { data: gers }] = await Promise.all([
      supabaseAdmin
        .from("leads_hierarquia_aliases")
        .select("tipo, alias_normalizado, profile_id, gerente_id"),
      supabaseAdmin.from("profiles").select("id, nome, email"),
      supabaseAdmin.from("gerentes").select("id, nome"),
    ]);
    const profName = new Map<string, string>();
    for (const p of profs ?? []) profName.set((p as any).id, (p as any).nome || (p as any).email || "");
    const gerName = new Map<string, string>();
    for (const g of gers ?? []) gerName.set((g as any).id, (g as any).nome || "");
    const supByNorm = new Map<string, string>();
    const gerByNorm = new Map<string, string>();
    for (const a of aliases ?? []) {
      const row = a as any;
      if (row.tipo === "superintendente" && row.profile_id) {
        const n = profName.get(row.profile_id);
        if (n) supByNorm.set(row.alias_normalizado, n);
      } else if (row.tipo === "gerente" && row.gerente_id) {
        const n = gerName.get(row.gerente_id);
        if (n) gerByNorm.set(row.alias_normalizado, n);
      }
    }
    const resolved = (leads ?? []).map((l: any) => {
      const out = { ...l };
      if (l.superintendente) {
        const r = supByNorm.get(normHier(String(l.superintendente)));
        if (r) out.superintendente = r;
      }
      if (l.gerente) {
        const r = gerByNorm.get(normHier(String(l.gerente)));
        if (r) out.gerente = r;
      }
      return out;
    });
    return { leads: resolved, produtos: produtos ?? [] };
  });

export const leadsResumoUser = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    const { data: auth, error: aerr } = await supabaseAdmin.auth.getUser(data.token);
    if (aerr || !auth.user) throw new Error("Não autenticado");
    const uid = auth.user.id;

    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", uid);
    const isAdmin = !!roles?.some((r: any) => r.role === "admin");

    const { data: me } = await supabaseAdmin
      .from("profiles").select("id, nome, cargo, diretor_id").eq("id", uid).maybeSingle();

    let allowedSupIds: Set<string> | null = null;
    let allowedGerIds: Set<string> | null = null;

    if (!isAdmin) {
      allowedSupIds = new Set<string>();
      allowedGerIds = new Set<string>();
      const cargo = (me as any)?.cargo;
      if (cargo === "diretor") {
        const { data: sups } = await supabaseAdmin
          .from("profiles").select("id").eq("cargo", "superintendente").eq("diretor_id", uid);
        for (const s of sups ?? []) allowedSupIds.add((s as any).id);
        if (allowedSupIds.size) {
          const { data: gs } = await supabaseAdmin
            .from("gerentes").select("id").in("superintendente_id", Array.from(allowedSupIds));
          for (const g of gs ?? []) allowedGerIds.add((g as any).id);
        }
      } else if (cargo === "superintendente") {
        allowedSupIds.add(uid);
        const { data: gs } = await supabaseAdmin
          .from("gerentes").select("id").eq("superintendente_id", uid);
        for (const g of gs ?? []) allowedGerIds.add((g as any).id);
      } else {
        return { leads: [], produtos: [] };
      }
      if (allowedSupIds.size === 0 && allowedGerIds.size === 0) {
        return { leads: [], produtos: [] };
      }
    }

    const all: any[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: page, error } = await supabaseAdmin
        .from("leads_facebook").select("*")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      all.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const { data: produtos } = await supabaseAdmin
      .from("produtos_oficiais").select("id, nome, ativo").order("nome");

    const [{ data: aliases }, { data: profs }, { data: gers }] = await Promise.all([
      supabaseAdmin.from("leads_hierarquia_aliases").select("tipo, alias_normalizado, profile_id, gerente_id"),
      supabaseAdmin.from("profiles").select("id, nome, email"),
      supabaseAdmin.from("gerentes").select("id, nome"),
    ]);
    const profName = new Map<string, string>();
    for (const p of profs ?? []) profName.set((p as any).id, (p as any).nome || (p as any).email || "");
    const gerName = new Map<string, string>();
    for (const g of gers ?? []) gerName.set((g as any).id, (g as any).nome || "");
    const supByNorm = new Map<string, { profile_id: string; name: string }>();
    const gerByNorm = new Map<string, { gerente_id: string; name: string }>();
    for (const a of aliases ?? []) {
      const row = a as any;
      if (row.tipo === "superintendente" && row.profile_id) {
        supByNorm.set(row.alias_normalizado, { profile_id: row.profile_id, name: profName.get(row.profile_id) || "" });
      } else if (row.tipo === "gerente" && row.gerente_id) {
        gerByNorm.set(row.alias_normalizado, { gerente_id: row.gerente_id, name: gerName.get(row.gerente_id) || "" });
      }
    }

    const resolved = all.map((l: any) => {
      const out: any = { ...l };
      let supPid: string | null = null;
      let gerId: string | null = null;
      if (l.superintendente) {
        const r = supByNorm.get(normHier(String(l.superintendente)));
        if (r) { out.superintendente = r.name; supPid = r.profile_id; }
      }
      if (l.gerente) {
        const r = gerByNorm.get(normHier(String(l.gerente)));
        if (r) { out.gerente = r.name; gerId = r.gerente_id; }
      }
      return { row: out, supPid, gerId };
    });

    const filtered = (isAdmin
      ? resolved
      : resolved.filter(({ supPid, gerId }) =>
          (supPid && allowedSupIds!.has(supPid)) || (gerId && allowedGerIds!.has(gerId))
        )
    ).map((x) => x.row);

    return { leads: filtered, produtos: produtos ?? [] };
  });

export const produtosList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { data: produtos } = await supabaseAdmin
      .from("produtos_oficiais")
      .select("*, produto_aliases(id, alias, vezes_usado)")
      .order("nome");
    return produtos ?? [];
  });

export const leadsConfirm = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ConfirmInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const { data: lead, error: lErr } = await supabaseAdmin
      .from("leads_facebook")
      .select("*")
      .eq("id", data.lead_id)
      .single();
    if (lErr || !lead) throw new Error("Lead não encontrado");

    let alias_id: string | null = null;
    if (data.criar_alias) {
      const { data: existing } = await supabaseAdmin
        .from("produto_aliases")
        .select("id, vezes_usado, produto_id")
        .eq("alias_normalizado", lead.nome_normalizado)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("produto_aliases")
          .update({ vezes_usado: (existing.vezes_usado ?? 0) + 1, produto_id: data.produto_id })
          .eq("id", existing.id);
        alias_id = existing.id;
      } else {
        const { data: created } = await supabaseAdmin
          .from("produto_aliases")
          .insert({
            produto_id: data.produto_id,
            alias: lead.nome_original,
            alias_normalizado: lead.nome_normalizado,
            vezes_usado: 1,
            created_by: userId,
          })
          .select("id")
          .single();
        alias_id = created?.id ?? null;
      }
    }

    await supabaseAdmin
      .from("leads_facebook")
      .update({
        produto_id: data.produto_id,
        status: "aprovado_manual",
        origem_decisao: "manual",
        decidido_por: userId,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", lead.id);

    await supabaseAdmin.from("leads_decisoes").insert({
      lead_id: lead.id,
      acao: "confirmou",
      produto_id: data.produto_id,
      alias_id,
      score: lead.score,
      origem: "manual",
      usuario_id: userId,
    });

    return { ok: true };
  });

export const leadsCriarProduto = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => NovoProdutoInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const norm = normalize(data.nome);
    const { data: prod, error } = await supabaseAdmin
      .from("produtos_oficiais")
      .insert({ nome: data.nome, nome_normalizado: norm, descricao: data.descricao ?? null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads_facebook")
        .select("nome_original, nome_normalizado")
        .eq("id", data.lead_id)
        .single();
      if (lead) {
        const { data: alias } = await supabaseAdmin
          .from("produto_aliases")
          .insert({
            produto_id: prod.id,
            alias: lead.nome_original,
            alias_normalizado: lead.nome_normalizado,
            vezes_usado: 1,
            created_by: userId,
          })
          .select("id")
          .single();
        await supabaseAdmin
          .from("leads_facebook")
          .update({
            produto_id: prod.id,
            status: "aprovado_manual",
            origem_decisao: "manual",
            decidido_por: userId,
            decidido_em: new Date().toISOString(),
          })
          .eq("id", data.lead_id);
        await supabaseAdmin.from("leads_decisoes").insert({
          lead_id: data.lead_id,
          acao: "criou_produto",
          produto_id: prod.id,
          alias_id: alias?.id ?? null,
          origem: "manual",
          usuario_id: userId,
        });
      }
    }
    return prod;
  });

export const leadsCriarAlias = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => NovoAliasInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const norm = normalize(data.alias);
    const { data: alias, error } = await supabaseAdmin
      .from("produto_aliases")
      .insert({
        produto_id: data.produto_id,
        alias: data.alias,
        alias_normalizado: norm,
        vezes_usado: 0,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return alias;
  });

export const leadsMarcarIndefinido = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => MarcarIndefinidoInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await supabaseAdmin
      .from("leads_facebook")
      .update({ status: "indefinido", produto_id: null, decidido_por: userId, decidido_em: new Date().toISOString(), origem_decisao: "manual" })
      .eq("id", data.lead_id);
    await supabaseAdmin.from("leads_decisoes").insert({
      lead_id: data.lead_id,
      acao: "marcou_indefinido",
      origem: "manual",
      usuario_id: userId,
    });
    return { ok: true };
  });

export const leadsHistorico = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string(), lead_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    const { data: hist } = await supabaseAdmin
      .from("leads_decisoes")
      .select("*")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    return hist ?? [];
  });

const ConfirmBulkInput = z.object({
  token: z.string().min(1),
  lead_ids: z.array(z.string().uuid()).min(1),
  produto_id: z.string().uuid(),
  criar_alias: z.boolean().default(true),
});

const IN_CHUNK = 200;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
async function selectByIdsChunked<T>(
  ids: string[],
  select: string,
): Promise<T[]> {
  const all: T[] = [];
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("leads_facebook")
      .select(select)
      .in("id", part);
    if (error) throw new Error(error.message);
    if (data) all.push(...(data as unknown as T[]));
  }
  return all;
}
async function updateLeadsByIdsChunked(ids: string[], patch: Record<string, unknown>) {
  for (const part of chunk(ids, IN_CHUNK)) {
    const { error } = await supabaseAdmin.from("leads_facebook").update(patch as never).in("id", part);
    if (error) throw new Error(error.message);
  }
}

async function insertDecisoesChunked(rows: Record<string, unknown>[]) {
  for (const part of chunk(rows, IN_CHUNK)) {
    const { error } = await supabaseAdmin.from("leads_decisoes").insert(part as never);
    if (error) throw new Error(error.message);
  }
}

export const leadsConfirmBulk = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ConfirmBulkInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const leads = await selectByIdsChunked<{ id: string; nome_original: string; nome_normalizado: string; score: number }>(
      data.lead_ids,
      "id, nome_original, nome_normalizado, score",
    );
    if (!leads?.length) return { ok: true, updated: 0 };

    if (data.criar_alias) {
      const seen = new Set<string>();
      for (const lead of leads) {
        const key = lead.nome_normalizado;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const { data: existing } = await supabaseAdmin
          .from("produto_aliases")
          .select("id, vezes_usado")
          .eq("alias_normalizado", key)
          .maybeSingle();
        if (existing) {
          await supabaseAdmin
            .from("produto_aliases")
            .update({ vezes_usado: (existing.vezes_usado ?? 0) + 1, produto_id: data.produto_id })
            .eq("id", existing.id);
        } else {
          await supabaseAdmin.from("produto_aliases").insert({
            produto_id: data.produto_id,
            alias: lead.nome_original,
            alias_normalizado: key,
            vezes_usado: 1,
            created_by: userId,
          });
        }
      }
    }

    const now = new Date().toISOString();
    await updateLeadsByIdsChunked(data.lead_ids, {
      produto_id: data.produto_id,
      status: "aprovado_manual",
      origem_decisao: "manual",
      decidido_por: userId,
      decidido_em: now,
    });

    await insertDecisoesChunked(
      leads.map((l) => ({
        lead_id: l.id,
        acao: "confirmou",
        produto_id: data.produto_id,
        score: l.score,
        origem: "manual",
        usuario_id: userId,
      })),
    );
    return { ok: true, updated: leads.length };
  });

const NovoProdutoBulkInput = z.object({
  token: z.string().min(1),
  lead_ids: z.array(z.string().uuid()).min(1),
  nome: z.string().trim().min(1).max(200),
  descricao: z.string().max(500).optional().nullable(),
});

const ConfirmSugeridosInput = z.object({
  token: z.string().min(1),
  lead_ids: z.array(z.string().uuid()).min(1),
  criar_alias: z.boolean().default(true),
});

export const leadsConfirmSugeridosBulk = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ConfirmSugeridosInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    const leads = await selectByIdsChunked<{ id: string; nome_original: string; nome_normalizado: string; score: number; produto_id: string | null; produto_sugerido_id: string | null }>(
      data.lead_ids,
      "id, nome_original, nome_normalizado, score, produto_id, produto_sugerido_id",
    );
    if (!leads?.length) return { ok: true, updated: 0, skipped: 0 };

    let updated = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const lead of leads) {
      const produto_id = lead.produto_id ?? lead.produto_sugerido_id;
      if (!produto_id) { skipped++; continue; }

      if (data.criar_alias && lead.nome_normalizado) {
        const { data: existing } = await supabaseAdmin
          .from("produto_aliases")
          .select("id, vezes_usado")
          .eq("alias_normalizado", lead.nome_normalizado)
          .maybeSingle();
        if (existing) {
          await supabaseAdmin
            .from("produto_aliases")
            .update({ vezes_usado: (existing.vezes_usado ?? 0) + 1, produto_id })
            .eq("id", existing.id);
        } else {
          await supabaseAdmin.from("produto_aliases").insert({
            produto_id,
            alias: lead.nome_original,
            alias_normalizado: lead.nome_normalizado,
            vezes_usado: 1,
            created_by: userId,
          });
        }
      }

      await supabaseAdmin
        .from("leads_facebook")
        .update({
          produto_id,
          status: "aprovado_manual",
          origem_decisao: "manual",
          decidido_por: userId,
          decidido_em: now,
        })
        .eq("id", lead.id);

      await supabaseAdmin.from("leads_decisoes").insert({
        lead_id: lead.id,
        acao: "confirmou",
        produto_id,
        score: lead.score,
        origem: "manual",
        usuario_id: userId,
      });
      updated++;
    }

    return { ok: true, updated, skipped };
  });

export const leadsCriarProdutoBulk = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => NovoProdutoBulkInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const norm = normalize(data.nome);
    const { data: prod, error } = await supabaseAdmin
      .from("produtos_oficiais")
      .insert({ nome: data.nome, nome_normalizado: norm, descricao: data.descricao ?? null })
      .select("*")
      .single();
    if (error || !prod) throw new Error(error?.message ?? "Falha ao criar produto");

    const leads = await selectByIdsChunked<{ id: string; nome_original: string; nome_normalizado: string }>(
      data.lead_ids,
      "id, nome_original, nome_normalizado",
    );

    const seen = new Set<string>();
    for (const lead of leads ?? []) {
      const key = lead.nome_normalizado;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const { data: existing } = await supabaseAdmin
        .from("produto_aliases")
        .select("id, vezes_usado")
        .eq("alias_normalizado", key)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("produto_aliases")
          .update({ vezes_usado: (existing.vezes_usado ?? 0) + 1, produto_id: prod.id })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("produto_aliases").insert({
          produto_id: prod.id,
          alias: lead.nome_original,
          alias_normalizado: key,
          vezes_usado: 1,
          created_by: userId,
        });
      }
    }

    const now = new Date().toISOString();
    await updateLeadsByIdsChunked(data.lead_ids, {
      produto_id: prod.id,
      status: "aprovado_manual",
      origem_decisao: "manual",
      decidido_por: userId,
      decidido_em: now,
    });

    await insertDecisoesChunked(
      (leads ?? []).map((l) => ({
        lead_id: l.id,
        acao: "criou_produto",
        produto_id: prod.id,
        origem: "manual",
        usuario_id: userId,
      })),
    );
    return { ok: true, produto: prod, updated: leads?.length ?? 0 };
  });

// =========================================================
// HIERARQUIA: vínculo nomes-de-lead -> profiles/gerentes
// =========================================================

function normHier(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^gerente\s+/i, "")
    .replace(/\.$/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const hierarquiaAliasesList = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);

    // Sups (profiles) e Gerentes ativos
    const [{ data: profs }, { data: gers }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, nome, email, cargo, diretor_id").in("cargo", ["superintendente"]),
      supabaseAdmin.from("gerentes").select("id, nome, superintendente_id, ativo"),
    ]);

    // Aliases já cadastrados
    const { data: aliases } = await supabaseAdmin
      .from("leads_hierarquia_aliases")
      .select("id, tipo, alias, alias_normalizado, profile_id, gerente_id");

    // Distinct names from leads
    // Paginação manual: o Supabase limita a 1000 linhas por query,
    // então gerentes/sups presentes apenas em leads antigos ficavam de fora.
    async function fetchAllDistinct(col: "superintendente" | "gerente"): Promise<string[]> {
      const out: string[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data: page, error } = await supabaseAdmin
          .from("leads_facebook")
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
    const [leadsSupVals, leadsGerVals] = await Promise.all([
      fetchAllDistinct("superintendente"),
      fetchAllDistinct("gerente"),
    ]);

    const supSet = new Map<string, string>(); // alias_normalizado -> alias original
    for (const v of leadsSupVals) {
      const raw = v.trim();
      if (!raw) continue;
      const norm = normHier(raw);
      if (norm && !supSet.has(norm)) supSet.set(norm, raw);
    }
    const gerSet = new Map<string, string>();
    for (const v of leadsGerVals) {
      const raw = v.trim();
      if (!raw) continue;
      const norm = normHier(raw);
      if (norm && !gerSet.has(norm)) gerSet.set(norm, raw);
    }

    // Mapas para sugestão
    const profByNorm = new Map<string, string>(); // norm -> id
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

const HierUpsertInput = z.object({
  token: z.string().min(1),
  tipo: z.enum(["superintendente", "gerente"]),
  alias: z.string().trim().min(1).max(200),
  profile_id: z.string().uuid().optional().nullable(),
  gerente_id: z.string().uuid().optional().nullable(),
});

export const hierarquiaAliasUpsert = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => HierUpsertInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const norm = normHier(data.alias);
    if (!norm) throw new Error("Alias inválido");

    const row: any = {
      tipo: data.tipo,
      alias: data.alias.trim(),
      alias_normalizado: norm,
      profile_id: data.tipo === "superintendente" ? (data.profile_id ?? null) : null,
      gerente_id: data.tipo === "gerente" ? (data.gerente_id ?? null) : null,
      created_by: userId,
    };
    if (data.tipo === "superintendente" && !row.profile_id) throw new Error("Selecione o superintendente");
    if (data.tipo === "gerente" && !row.gerente_id) throw new Error("Selecione o gerente");

    const { error } = await supabaseAdmin
      .from("leads_hierarquia_aliases")
      .upsert(row, { onConflict: "tipo,alias_normalizado" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const HierDeleteInput = z.object({
  token: z.string().min(1),
  tipo: z.enum(["superintendente", "gerente"]),
  alias_normalizado: z.string().min(1),
});

export const hierarquiaAliasDelete = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => HierDeleteInput.parse(i))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { error } = await supabaseAdmin
      .from("leads_hierarquia_aliases")
      .delete()
      .eq("tipo", data.tipo)
      .eq("alias_normalizado", data.alias_normalizado);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// MOVER ALIAS de produto (corrige vínculo errado)
// Reatribui o alias para outro produto, reclassifica os leads
// que foram aprovados por esse alias e recalcula `vezes_usado`
// para os aliases dos dois produtos envolvidos (origem e destino).
// =========================================================

const AliasMoverInput = z.object({
  token: z.string().min(1),
  alias_id: z.string().uuid(),
  novo_produto_id: z.string().uuid(),
});

async function recomputeAliasUsage(produto_id: string) {
  const { data: aliases } = await supabaseAdmin
    .from("produto_aliases")
    .select("id, alias_normalizado")
    .eq("produto_id", produto_id);
  for (const a of aliases ?? []) {
    const { count } = await supabaseAdmin
      .from("leads_facebook")
      .select("id", { count: "exact", head: true })
      .eq("nome_normalizado", (a as any).alias_normalizado)
      .eq("produto_id", produto_id);
    await supabaseAdmin
      .from("produto_aliases")
      .update({ vezes_usado: count ?? 0 })
      .eq("id", (a as any).id);
  }
}

export const leadsAliasMover = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AliasMoverInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await assertAdmin(data.token);
    await assertCanWrite(data.token);

    const { data: alias, error: aErr } = await supabaseAdmin
      .from("produto_aliases")
      .select("id, alias, alias_normalizado, produto_id")
      .eq("id", data.alias_id)
      .single();
    if (aErr || !alias) throw new Error("Alias não encontrado");
    if (alias.produto_id === data.novo_produto_id) {
      return { ok: true, movidos: 0, sem_mudanca: true };
    }
    const origem_produto_id = alias.produto_id;

    const { data: novo, error: nErr } = await supabaseAdmin
      .from("produtos_oficiais")
      .select("id")
      .eq("id", data.novo_produto_id)
      .single();
    if (nErr || !novo) throw new Error("Produto destino não encontrado");

    // Verifica se já existe alias com mesmo normalizado no produto destino.
    // Se sim, consolida: remove o alias atual e mantém o existente.
    const { data: existingNoDestino } = await supabaseAdmin
      .from("produto_aliases")
      .select("id")
      .eq("produto_id", data.novo_produto_id)
      .eq("alias_normalizado", alias.alias_normalizado)
      .maybeSingle();

    // Reatribui leads que estavam aprovados por esse alias.
    const { data: leadsAfetados } = await supabaseAdmin
      .from("leads_facebook")
      .select("id, score")
      .eq("nome_normalizado", alias.alias_normalizado)
      .eq("produto_id", origem_produto_id);

    const now = new Date().toISOString();
    if (leadsAfetados && leadsAfetados.length > 0) {
      const ids = leadsAfetados.map((l: any) => l.id);
      await updateLeadsByIdsChunked(ids, {
        produto_id: data.novo_produto_id,
        status: "aprovado_manual",
        origem_decisao: "manual",
        decidido_por: userId,
        decidido_em: now,
      });
      await insertDecisoesChunked(
        leadsAfetados.map((l: any) => ({
          lead_id: l.id,
          acao: "moveu_alias",
          produto_id: data.novo_produto_id,
          alias_id: alias.id,
          score: l.score,
          origem: "manual",
          usuario_id: userId,
          observacao: `Alias "${alias.alias}" movido de ${origem_produto_id} para ${data.novo_produto_id}`,
        })),
      );
    }

    if (existingNoDestino) {
      // remove o alias antigo, leads já apontam pro destino
      await supabaseAdmin.from("produto_aliases").delete().eq("id", alias.id);
    } else {
      await supabaseAdmin
        .from("produto_aliases")
        .update({ produto_id: data.novo_produto_id })
        .eq("id", alias.id);
    }

    // Recalcula aprendizado (vezes_usado) para ambos os produtos
    if (origem_produto_id) await recomputeAliasUsage(origem_produto_id);
    await recomputeAliasUsage(data.novo_produto_id);

    return { ok: true, movidos: leadsAfetados?.length ?? 0 };
  });