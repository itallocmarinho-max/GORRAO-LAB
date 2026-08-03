// Regra de disponibilidade de gerente em um mês/ano de referência:
// - Se ativo = true, sempre disponível.
// - Se inativo (ativo = false) e tiver inativo_mes/ano definidos,
//   fica disponível apenas para meses estritamente ANTES desse marco.
// - Se inativo sem marco, fica indisponível.
export type GerenteAtividade = {
  ativo: boolean;
  inativo_mes: number | null;
  inativo_ano: number | null;
};

export function gerenteDisponivelEm(
  g: GerenteAtividade,
  mes: number | null | undefined,
  ano: number | null | undefined,
): boolean {
  if (g.ativo) return true;
  if (!g.inativo_mes || !g.inativo_ano) return false;
  if (!mes || !ano) return false;
  if (ano < g.inativo_ano) return true;
  if (ano === g.inativo_ano && mes < g.inativo_mes) return true;
  return false;
}
