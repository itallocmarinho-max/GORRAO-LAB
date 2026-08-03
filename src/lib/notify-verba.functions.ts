import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const inputSchema = z.object({
  formularioId: z.string().uuid(),
  status: z.enum(["validado", "reprovado"]),
});

export const notifyVerbaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const log = (msg: string, extra?: Record<string, unknown>) =>
      console.log(`[notifyVerbaStatus] ${msg}`, extra ?? "");

    log("início do envio", { formularioId: data.formularioId, status: data.status });

    const SENDER_DOMAIN = "notify.diretoriagorrao.com";
    const FROM = `Diretoria Gorrao <noreply@${SENDER_DOMAIN}>`;

    // Buscar formulário
    const { data: form, error: formErr } = await supabaseAdmin
      .from("formularios")
      .select("id, nome, tipo, mes_referencia, ano_referencia, usuario_id, valor_agilitas, valor_marketing")
      .eq("id", data.formularioId)
      .maybeSingle();
    if (formErr || !form) {
      console.error("[notifyVerbaStatus] formulário não encontrado", formErr);
      return { ok: false, error: "form não encontrado" };
    }
    if (form.tipo !== "verba_cury") {
      log("ignorado: não é verba_cury", { tipo: form.tipo });
      return { ok: true, skipped: true };
    }

    // Email do criador
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, nome")
      .eq("id", form.usuario_id)
      .maybeSingle();
    const to = profile?.email;
    if (!to) {
      console.error("[notifyVerbaStatus] criador sem email", { usuario_id: form.usuario_id });
      return { ok: false, error: "criador sem email" };
    }

    // Aprovador (usuário autenticado que disparou a ação)
    const { data: approver } = await supabaseAdmin
      .from("profiles")
      .select("nome, email")
      .eq("id", context.userId)
      .maybeSingle();
    const aprovadorNome = approver?.nome || approver?.email || "—";

    // Lançamentos reprovados (motivos)
    let motivosHtml = "";
    if (data.status === "reprovado") {
      const { data: lancs } = await supabaseAdmin
        .from("lancamentos")
        .select("nome_recebedor, valor, motivo_reprovacao")
        .eq("formulario_id", form.id)
        .eq("reprovado", true);
      if (lancs && lancs.length > 0) {
        motivosHtml =
          `<h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Motivos da reprovação</h3><ul style="font-family:Arial,sans-serif;font-size:14px;color:#333">` +
          lancs
            .map(
              (l) =>
                `<li><b>${escapeHtml(l.nome_recebedor || "—")}</b> — R$ ${Number(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}<br/><span style="color:#666">${escapeHtml(l.motivo_reprovacao || "Sem motivo informado")}</span></li>`,
            )
            .join("") +
          `</ul>`;
      } else {
        motivosHtml = `<p style="font-family:Arial,sans-serif;font-size:14px;color:#666">Nenhum motivo específico registrado por lançamento.</p>`;
      }
    }

    const ref =
      form.mes_referencia && form.ano_referencia
        ? `${MESES[form.mes_referencia - 1]}/${form.ano_referencia}`
        : form.nome || "—";
    const valorTotal = Number(form.valor_agilitas || 0) + Number(form.valor_marketing || 0);
    const dataStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const statusLabel = data.status === "validado" ? "APROVADA" : "REPROVADA";
    const statusColor = data.status === "validado" ? "#059669" : "#dc2626";
    const subject =
      data.status === "validado"
        ? `Sua Verba Cury ${ref} foi aprovada`
        : `Sua Verba Cury ref: ${ref} foi reprovada`;

    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#111">
  <h2 style="margin:0 0 16px">Verba Cury — ${escapeHtml(ref)}</h2>
  <p style="font-size:14px;color:#444">Olá ${escapeHtml(profile?.nome || "")},</p>
  <p style="font-size:14px;color:#444">Sua verba foi <b style="color:${statusColor}">${statusLabel}</b>.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
    <tr><td style="padding:6px 0;color:#666">Referência</td><td style="padding:6px 0"><b>${escapeHtml(ref)}</b></td></tr>
    <tr><td style="padding:6px 0;color:#666">Valor</td><td style="padding:6px 0"><b>R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b></td></tr>
    <tr><td style="padding:6px 0;color:#666">Data</td><td style="padding:6px 0"><b>${escapeHtml(dataStr)}</b></td></tr>
    <tr><td style="padding:6px 0;color:#666">Aprovador</td><td style="padding:6px 0"><b>${escapeHtml(aprovadorNome)}</b></td></tr>
    <tr><td style="padding:6px 0;color:#666">Status</td><td style="padding:6px 0"><b style="color:${statusColor}">${statusLabel}</b></td></tr>
  </table>
  ${motivosHtml}
  <p style="font-size:12px;color:#999;margin-top:32px">Este é um e-mail automático da Diretoria Gorrão.</p>
</div>`.trim();

    log("enviando", { to, status: data.status });
    try {
      const text = htmlToText(html);
      const message_id = crypto.randomUUID();
      const unsubscribeToken = await getOrCreateUnsubscribeToken(to);
      const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id,
          from: FROM,
          sender_domain: SENDER_DOMAIN,
          to,
          subject,
          html,
          text,
          purpose: "transactional",
          label: `verba-cury-${data.status}`,
          idempotency_key: `verba-${form.id}-${data.status}-${message_id}`,
          unsubscribe_token: unsubscribeToken,
        },
      });
      if (enqErr) {
        console.error("[notifyVerbaStatus] enqueue falhou", enqErr);
        return { ok: false, error: enqErr.message };
      }
      log("enfileirado", { to, status: data.status, message_id });
      return { ok: true, id: message_id };
    } catch (err) {
      console.error("[notifyVerbaStatus] erro detalhado", err);
      return { ok: false, error: (err as Error).message };
    }
  });

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getOrCreateUnsubscribeToken(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.token) return existing.token;

  const token = crypto.randomUUID();
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .insert({ email: normalizedEmail, token })
    .select("token")
    .single();

  if (!insertError && inserted?.token) return inserted.token;

  const { data: fallback, error: fallbackError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (fallbackError) throw fallbackError;
  if (fallback?.token) return fallback.token;

  throw insertError ?? new Error("Não foi possível criar token de descadastro");
}

function htmlToText(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}