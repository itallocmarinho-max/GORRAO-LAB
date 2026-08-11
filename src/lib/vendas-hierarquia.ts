export type VendasHierarquiaTipo = "diretor" | "superintendente" | "gerente";

export type VendaHierarquiaAlias = {
  tipo: VendasHierarquiaTipo;
  alias: string;
  alias_normalizado: string;
  profile_id: string | null;
  gerente_id: string | null;
  externo: boolean;
};

export type VendaHierarquiaRaw = {
  diretor?: string | null;
  superintendente?: string | null;
  gerente?: string | null;
  corretor?: string | null;
  diretor_fifty?: string | null;
  superintendente_fifty?: string | null;
  gerente_fifty?: string | null;
  corretor_fifty?: string | null;
  diretor_profile_id?: string | null;
  superintendente_profile_id?: string | null;
  gerente_id?: string | null;
};

export type VendaHierarquiaDiretorio = {
  profiles: Map<string, string>;
  gerentes: Map<string, { nome: string; superintendente_id: string | null }>;
};

export type VendaCredito = {
  lado: "principal" | "fifty";
  unidades: number;
  diretor_id: string | null;
  diretor: string | null;
  superintendente_id: string | null;
  superintendente: string | null;
  gerente_id: string | null;
  gerente: string | null;
  corretor: string | null;
};

export function normalizeSalesHierarchy(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(diretor|superintendente|super|gerente)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildVendaAliasIndex(rows: VendaHierarquiaAlias[]) {
  const index = new Map<string, VendaHierarquiaAlias>();
  for (const row of rows) index.set(`${row.tipo}:${row.alias_normalizado}`, row);
  return index;
}

function aliasFor(
  index: Map<string, VendaHierarquiaAlias>,
  tipo: VendasHierarquiaTipo,
  raw: string | null | undefined,
) {
  const normalized = normalizeSalesHierarchy(raw);
  return normalized ? (index.get(`${tipo}:${normalized}`) ?? null) : null;
}

/**
 * Transforma uma venda em um ou dois créditos gerenciais.
 * A presença de qualquer corretor fifty divide a venda em 0,5 + 0,5. A soma
 * por destino recompõe automaticamente 1 quando os dois lados pertencem à
 * mesma liderança.
 */
export function buildVendaCreditos(
  venda: VendaHierarquiaRaw,
  aliases: Map<string, VendaHierarquiaAlias>,
  diretorio: VendaHierarquiaDiretorio,
): VendaCredito[] {
  const hasFifty = Boolean(
    venda.corretor_fifty?.trim() ||
    venda.gerente_fifty?.trim() ||
    venda.superintendente_fifty?.trim() ||
    venda.diretor_fifty?.trim(),
  );
  const sides: Array<{
    lado: "principal" | "fifty";
    unidades: number;
    diretor: string | null | undefined;
    superintendente: string | null | undefined;
    gerente: string | null | undefined;
    corretor: string | null | undefined;
    diretor_id: string | null;
    superintendente_id: string | null;
    gerente_id: string | null;
  }> = [
    {
      lado: "principal",
      unidades: hasFifty ? 0.5 : 1,
      diretor: venda.diretor,
      superintendente: venda.superintendente,
      gerente: venda.gerente,
      corretor: venda.corretor,
      diretor_id: venda.diretor_profile_id ?? null,
      superintendente_id: venda.superintendente_profile_id ?? null,
      gerente_id: venda.gerente_id ?? null,
    },
  ];
  if (hasFifty) {
    sides.push({
      lado: "fifty",
      unidades: 0.5,
      // Campo fifty vazio significa que o segundo corretor pertence à mesma
      // hierarquia do principal (ex.: Lenk + Gaeta). Assim os corretores ficam
      // com 0,5 cada, enquanto gerente, SUP e diretor recompõem 1 venda.
      diretor: venda.diretor_fifty?.trim() || venda.diretor,
      superintendente: venda.superintendente_fifty?.trim() || venda.superintendente,
      gerente: venda.gerente_fifty?.trim() || venda.gerente,
      corretor: venda.corretor_fifty,
      diretor_id: null,
      superintendente_id: null,
      gerente_id: null,
    });
  }

  return sides.map((side) => {
    const diretorAlias = aliasFor(aliases, "diretor", side.diretor);
    const supAlias = aliasFor(aliases, "superintendente", side.superintendente);
    const gerenteAlias = aliasFor(aliases, "gerente", side.gerente);

    const gerenteId = gerenteAlias
      ? gerenteAlias.externo
        ? null
        : gerenteAlias.gerente_id
      : side.gerente_id;
    const gerenteInfo = gerenteId ? diretorio.gerentes.get(gerenteId) : null;
    const supIdFromAlias = supAlias
      ? supAlias.externo
        ? null
        : supAlias.profile_id
      : side.superintendente_id;
    const superintendenteId = gerenteInfo?.superintendente_id || supIdFromAlias || null;
    const diretorId = diretorAlias
      ? diretorAlias.externo
        ? null
        : diretorAlias.profile_id
      : side.diretor_id;

    return {
      lado: side.lado,
      unidades: side.unidades,
      diretor_id: diretorId,
      diretor: diretorId ? (diretorio.profiles.get(diretorId) ?? side.diretor ?? null) : null,
      superintendente_id: superintendenteId,
      superintendente: superintendenteId
        ? (diretorio.profiles.get(superintendenteId) ?? side.superintendente ?? null)
        : null,
      gerente_id: gerenteId,
      gerente: gerenteInfo?.nome ?? null,
      corretor: side.corretor?.trim() || null,
    };
  });
}
