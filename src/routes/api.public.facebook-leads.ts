import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const trig = (s: string) => {
    const padded = `  ${s} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    return set;
  };
  const A = trig(a); const B = trig(b);
  let inter = 0; A.forEach((t) => { if (B.has(t)) inter++; });
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

const Schema = z.object({
  nome: z.string().min(1).max(500),
  campanha: z.string().max(500).optional().nullable(),
  formulario: z.string().max(500).optional().nullable(),
  payload: z.any().optional(),
});

export const Route = createFileRoute("/api/public/facebook-leads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-webhook-secret",
        },
      }),
      POST: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        };
        const expected = process.env.FACEBOOK_LEADS_WEBHOOK_SECRET;
        const provided = request.headers.get("x-webhook-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
        }
        let body: unknown;
        try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors }); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400, headers: cors });

        const data = parsed.data;
        const norm = normalize(data.nome);

        const { data: aliasExact } = await supabaseAdmin.from("produto_aliases").select("produto_id").eq("alias_normalizado", norm).maybeSingle();
        let best: { produto_id: string | null; score: number } = { produto_id: aliasExact?.produto_id ?? null, score: aliasExact ? 1 : 0 };
        if (best.score < 1) {
          const { data: prodExact } = await supabaseAdmin.from("produtos_oficiais").select("id").eq("nome_normalizado", norm).eq("ativo", true).maybeSingle();
          if (prodExact) best = { produto_id: prodExact.id, score: 1 };
        }
        if (best.score < 1) {
          const [{ data: produtos }, { data: aliases }] = await Promise.all([
            supabaseAdmin.from("produtos_oficiais").select("id, nome_normalizado").eq("ativo", true),
            supabaseAdmin.from("produto_aliases").select("produto_id, alias_normalizado"),
          ]);
          for (const p of produtos ?? []) {
            const s = trigramSimilarity(norm, p.nome_normalizado);
            if (s > best.score) best = { produto_id: p.id, score: s };
          }
          for (const a of aliases ?? []) {
            const s = trigramSimilarity(norm, a.alias_normalizado);
            if (s > best.score) best = { produto_id: a.produto_id, score: s };
          }
        }

        let status = "indefinido", produto_id: string | null = null, produto_sugerido_id: string | null = null, origem: string | null = null;
        if (best.score >= 0.9 && best.produto_id) { status = "aprovado_auto"; produto_id = best.produto_id; origem = "automatica"; }
        else if (best.score >= 0.7 && best.produto_id) { status = "pendente"; produto_sugerido_id = best.produto_id; }
        else { produto_sugerido_id = best.produto_id; }

        const { data: lead, error } = await supabaseAdmin.from("leads_facebook").insert({
          nome_original: data.nome,
          nome_normalizado: norm,
          campanha: data.campanha ?? null,
          formulario: data.formulario ?? null,
          payload: data.payload ?? null,
          produto_id, produto_sugerido_id,
          score: Number(best.score.toFixed(4)),
          status, origem_decisao: origem,
          decidido_em: status === "aprovado_auto" ? new Date().toISOString() : null,
        }).select("id, status, score, produto_id, produto_sugerido_id").single();
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

        await supabaseAdmin.from("leads_decisoes").insert({
          lead_id: lead.id,
          acao: status === "aprovado_auto" ? "classificou_auto" : "marcou_indefinido",
          produto_id, score: lead.score, origem: "automatica",
        });

        return new Response(JSON.stringify({ ok: true, lead }), { status: 200, headers: cors });
      },
    },
  },
});