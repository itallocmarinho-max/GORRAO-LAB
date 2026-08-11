/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildVendaAliasIndex,
  buildVendaCreditos,
  type VendaHierarquiaAlias,
} from "@/lib/vendas-hierarquia";

const ResumoInput = z.object({
  token: z.string().min(1),
  modo: z.enum(["mes", "semana"]),
  referencia: z.string().min(7).max(10),
});

export type ResumoSup = {
  id: string;
  nome: string;
  vendas: number;
  leads: number;
  checkins: number | null;
  visitas: number | null;
  pastas: number;
  ab: number;
  previsao: number;
  diferenca: number;
  candidatos: number;
  contratados: number;
  cadastrosRh: number | null;
};

export type ResumoInicio = {
  modo: "mes" | "semana";
  referencia: string;
  inicio: string;
  fim: string;
  periodoLabel: string;
  superintendentes: ResumoSup[];
};

type Periodo = {
  inicio: string;
  fim: string;
  fimExclusivo: string;
  inicioIso: string;
  fimExclusivoIso: string;
  mes: number;
  ano: number;
  label: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function periodo(modo: "mes" | "semana", referencia: string): Periodo {
  if (modo === "mes") {
    const match = referencia.match(/^(\d{4})-(\d{2})$/);
    if (!match) throw new Error("Mês de referência inválido");
    const ano = Number(match[1]);
    const mes = Number(match[2]);
    if (mes < 1 || mes > 12) throw new Error("Mês de referência inválido");
    const inicio = new Date(Date.UTC(ano, mes - 1, 1));
    const fimExclusivo = new Date(Date.UTC(ano, mes, 1));
    const fim = new Date(fimExclusivo.getTime() - 86_400_000);
    return {
      inicio: isoDate(inicio),
      fim: isoDate(fim),
      fimExclusivo: isoDate(fimExclusivo),
      inicioIso: `${isoDate(inicio)}T00:00:00.000Z`,
      fimExclusivoIso: `${isoDate(fimExclusivo)}T00:00:00.000Z`,
      mes,
      ano,
      label: new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(inicio),
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(referencia)) throw new Error("Semana de referência inválida");
  const selected = new Date(`${referencia}T00:00:00.000Z`);
  if (Number.isNaN(selected.getTime())) throw new Error("Semana de referência inválida");
  const day = selected.getUTCDay();
  selected.setUTCDate(selected.getUTCDate() - ((day + 6) % 7));
  const endExclusive = new Date(selected);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 7);
  const end = new Date(endExclusive.getTime() - 86_400_000);
  return {
    inicio: isoDate(selected),
    fim: isoDate(end),
    fimExclusivo: isoDate(endExclusive),
    inicioIso: `${isoDate(selected)}T00:00:00.000Z`,
    fimExclusivoIso: `${isoDate(endExclusive)}T00:00:00.000Z`,
    mes: selected.getUTCMonth() + 1,
    ano: selected.getUTCFullYear(),
    label: `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(selected)} a ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(end)}`,
  };
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(diretor|superintendente|super|gerente)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function collect(factory: (from: number, to: number) => PromiseLike<any>) {
  const rows: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await factory(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < size) break;
  }
  return rows;
}

export const resumoInicioLoad = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ResumoInput.parse(input))
  .handler(async ({ data }): Promise<ResumoInicio> => {
    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(data.token);
    if (authError || !auth.user) throw new Error("Não autenticado");
    const period = periodo(data.modo, data.referencia);
    const [{ data: roles }, { data: currentProfile }, { data: allProfiles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", auth.user.id),
      supabaseAdmin
        .from("profiles")
        .select("id, cargo, vinculado_id")
        .eq("id", auth.user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, nome, email, cargo, diretor_id, ativo, desativado_em")
        .eq("cargo", "superintendente"),
    ]);
    const isAdmin = Boolean(roles?.some((row) => row.role === "admin"));
    const cargo = currentProfile?.cargo;
    const linkedId = currentProfile?.vinculado_id;
    let sups = (allProfiles ?? []).filter((profile) => {
      const name = normalize(profile.nome || profile.email);
      if (name.replaceAll(" ", "").includes("processosinternos")) return false;
      if (profile.ativo) return true;
      return Boolean(
        profile.desativado_em && period.inicio.slice(0, 7) <= profile.desativado_em.slice(0, 7),
      );
    });

    if (!isAdmin) {
      if (cargo === "diretor") {
        sups = sups.filter((profile) => profile.diretor_id === auth.user.id);
      } else if (cargo === "superintendente") {
        sups = sups.filter((profile) => profile.id === auth.user.id);
      } else if (cargo === "rh" && linkedId) {
        const linked = await supabaseAdmin
          .from("profiles")
          .select("id, cargo")
          .eq("id", linkedId)
          .maybeSingle();
        sups =
          linked.data?.cargo === "diretor"
            ? sups.filter((profile) => profile.diretor_id === linkedId)
            : sups.filter((profile) => profile.id === linkedId);
      } else {
        sups = [];
      }
    }

    sups.sort((a, b) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "", "pt-BR"));
    const visibleIds = new Set(sups.map((profile) => profile.id));
    const metrics = new Map<string, ResumoSup>(
      sups.map((profile) => [
        profile.id,
        {
          id: profile.id,
          nome: profile.nome || profile.email || "Sem nome",
          vendas: 0,
          leads: 0,
          checkins: null,
          visitas: null,
          pastas: 0,
          ab: 0,
          previsao: 0,
          diferenca: 0,
          candidatos: 0,
          contratados: 0,
          cadastrosRh: null,
        },
      ]),
    );
    if (!metrics.size) {
      return {
        modo: data.modo,
        referencia: data.referencia,
        inicio: period.inicio,
        fim: period.fim,
        periodoLabel: period.label,
        superintendentes: [],
      };
    }

    const [{ data: hierarchyAliases }, { data: leadsAliases }, { data: managers }] =
      await Promise.all([
        (supabaseAdmin as any)
          .from("vendas_hierarquia_aliases")
          .select("tipo, alias, alias_normalizado, profile_id, gerente_id, externo"),
        supabaseAdmin
          .from("leads_hierarquia_aliases")
          .select("tipo, alias_normalizado, profile_id, gerente_id"),
        supabaseAdmin.from("gerentes").select("id, nome, superintendente_id"),
      ]);
    const supByName = new Map(
      sups.map((profile) => [normalize(profile.nome || profile.email), profile.id]),
    );
    const managerSup = new Map(
      (managers ?? []).map((manager) => [manager.id, manager.superintendente_id]),
    );
    const managerByName = new Map(
      (managers ?? []).map((manager) => [normalize(manager.nome), manager.id]),
    );

    const aliasMaps = (source: any[] | null) => {
      const supers = new Map<string, string>();
      const managerAliases = new Map<string, string>();
      for (const alias of source ?? []) {
        if (alias.externo) continue;
        if (alias.tipo === "superintendente" && alias.profile_id) {
          supers.set(alias.alias_normalizado, alias.profile_id);
        }
        if (alias.tipo === "gerente" && alias.gerente_id) {
          managerAliases.set(alias.alias_normalizado, alias.gerente_id);
        }
      }
      return { supers, managers: managerAliases };
    };
    const salesMaps = aliasMaps(hierarchyAliases ?? []);
    const leadMaps = aliasMaps(leadsAliases ?? []);
    const salesAliasIndex = buildVendaAliasIndex(
      ((hierarchyAliases ?? []) as VendaHierarquiaAlias[]).map((row) => ({
        ...row,
        externo: Boolean(row.externo),
      })),
    );
    const salesDirectory = {
      profiles: new Map<string, string>(
        sups.map((profile) => [profile.id, profile.nome || profile.email || ""]),
      ),
      gerentes: new Map(
        (managers ?? []).map((manager) => [
          manager.id,
          { nome: manager.nome, superintendente_id: manager.superintendente_id },
        ]),
      ),
    };
    const resolveSup = (
      rawSup: unknown,
      rawManager: unknown,
      maps: ReturnType<typeof aliasMaps>,
    ) => {
      const supKey = normalize(rawSup);
      const direct = maps.supers.get(supKey) || supByName.get(supKey);
      if (direct && visibleIds.has(direct)) return direct;
      const managerKey = normalize(rawManager);
      const managerId = maps.managers.get(managerKey) || managerByName.get(managerKey);
      const supId = managerId ? managerSup.get(managerId) : null;
      return supId && visibleIds.has(supId) ? supId : null;
    };
    const increment = (supId: string | null | undefined, key: keyof ResumoSup, value: number) => {
      if (!supId || !metrics.has(supId)) return;
      const target = metrics.get(supId)!;
      const current = target[key];
      if (typeof current === "number") (target[key] as number) = current + value;
    };

    const [sales, leads, pvs, abs, forecasts] = await Promise.all([
      collect((from, to) =>
        (supabaseAdmin as any)
          .from("vendas_salesforce")
          .select(
            "diretor, superintendente, gerente, corretor, diretor_fifty, superintendente_fifty, gerente_fifty, corretor_fifty, diretor_profile_id, superintendente_profile_id, gerente_id, data_assinatura",
          )
          .gte("data_assinatura", period.inicio)
          .lt("data_assinatura", period.fimExclusivo)
          .range(from, to),
      ),
      collect((from, to) =>
        supabaseAdmin
          .from("leads_facebook")
          .select("superintendente, gerente, contagem, created_at")
          .gte("created_at", period.inicioIso)
          .lt("created_at", period.fimExclusivoIso)
          .range(from, to),
      ),
      collect((from, to) =>
        (supabaseAdmin as any)
          .from("pastas_salesforce_pv")
          .select("pv_chave, superintendente_profile_id, superintendente, gerente, data_criacao")
          .range(from, to),
      ),
      collect((from, to) =>
        (supabaseAdmin as any)
          .from("pastas_salesforce_ab")
          .select("pv_chave, data_criacao")
          .gte("data_criacao", period.inicio)
          .lt("data_criacao", period.fimExclusivo)
          .range(from, to),
      ),
      collect((from, to) => {
        let query = supabaseAdmin
          .from("previsoes")
          .select(
            "superintendente, gerente, preciso_vendas, semana_inicio, semana_fim, mes_referencia, ano_referencia",
          );
        query =
          data.modo === "mes"
            ? query.eq("mes_referencia", period.mes).eq("ano_referencia", period.ano)
            : query.lte("semana_inicio", period.fim).gte("semana_fim", period.inicio);
        return query.range(from, to);
      }),
    ]);

    for (const sale of sales) {
      for (const credito of buildVendaCreditos(sale, salesAliasIndex, salesDirectory)) {
        increment(credito.superintendente_id, "vendas", credito.unidades);
      }
    }
    for (const lead of leads) {
      increment(
        resolveSup(lead.superintendente, lead.gerente, leadMaps),
        "leads",
        Number(lead.contagem || 1),
      );
    }

    const pvSup = new Map<string, string>();
    for (const pv of pvs) {
      const supId =
        (pv.superintendente_profile_id && visibleIds.has(pv.superintendente_profile_id)
          ? pv.superintendente_profile_id
          : null) || resolveSup(pv.superintendente, pv.gerente, salesMaps);
      if (supId) pvSup.set(pv.pv_chave, supId);
      if (pv.data_criacao >= period.inicio && pv.data_criacao < period.fimExclusivo) {
        increment(supId, "pastas", 1);
      }
    }
    const abPvs = new Set<string>();
    for (const analysis of abs) {
      const supId = pvSup.get(analysis.pv_chave);
      if (!supId) continue;
      const unique = `${supId}:${analysis.pv_chave}`;
      if (abPvs.has(unique)) continue;
      abPvs.add(unique);
      increment(supId, "ab", 1);
    }
    for (const forecast of forecasts) {
      increment(
        resolveSup(forecast.superintendente, forecast.gerente, salesMaps),
        "previsao",
        Number(forecast.preciso_vendas || 0),
      );
    }

    let formsQuery = supabaseAdmin
      .from("formularios")
      .select("id, superintendente, nome, mes_referencia, ano_referencia")
      .eq("tipo", "contratacao")
      .eq("status", "validado");
    if (data.modo === "mes") {
      formsQuery = formsQuery.eq("mes_referencia", period.mes).eq("ano_referencia", period.ano);
    }
    const { data: hiringForms, error: formsError } = await formsQuery;
    if (formsError) throw new Error(formsError.message);
    const formById = new Map((hiringForms ?? []).map((form) => [form.id, form]));
    if (formById.size) {
      const formIds = [...formById.keys()];
      const hiringRows: any[] = [];
      for (let start = 0; start < formIds.length; start += 200) {
        let query = supabaseAdmin
          .from("lancamentos")
          .select(
            "formulario_id, superintendente, gerente, candidatos, contratados, reprovado, data_hora",
          )
          .in("formulario_id", formIds.slice(start, start + 200))
          .eq("reprovado", false);
        if (data.modo === "semana") {
          query = query.gte("data_hora", period.inicioIso).lt("data_hora", period.fimExclusivoIso);
        }
        const { data: rows, error } = await query;
        if (error) throw new Error(error.message);
        hiringRows.push(...(rows ?? []));
      }
      for (const row of hiringRows) {
        const form = formById.get(row.formulario_id);
        const supId = resolveSup(
          row.superintendente || form?.superintendente || form?.nome,
          row.gerente,
          salesMaps,
        );
        increment(supId, "candidatos", Number(row.candidatos || 0));
        increment(supId, "contratados", Number(row.contratados || 0));
      }
    }

    const result = [...metrics.values()].map((item) => ({
      ...item,
      diferenca: item.vendas - item.previsao,
    }));
    return {
      modo: data.modo,
      referencia: data.referencia,
      inicio: period.inicio,
      fim: period.fim,
      periodoLabel: period.label,
      superintendentes: result,
    };
  });
