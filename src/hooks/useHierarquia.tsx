import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Diretor = { id: string; nome: string };
export type Superintendente = { id: string; nome: string; diretor_id: string | null };
export type Gerente = { id: string; nome: string; superintendente_id: string };

export function useHierarquia() {
  const [diretores, setDiretores] = useState<Diretor[]>([]);
  const [superintendentes, setSuperintendentes] = useState<Superintendente[]>([]);
  const [gerentes, setGerentes] = useState<Gerente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome, email, cargo, diretor_id")
        .in("cargo", ["diretor", "superintendente"]);
      const { data: gers } = await supabase
        .from("gerentes")
        .select("id, nome, superintendente_id, ativo");
      const dir = (profs ?? [])
        .filter((p: any) => p.cargo === "diretor")
        .map((p: any) => ({ id: p.id, nome: p.nome || p.email || "—" }));
      const sup = (profs ?? [])
        .filter((p: any) => p.cargo === "superintendente")
        .map((p: any) => ({ id: p.id, nome: p.nome || p.email || "—", diretor_id: p.diretor_id ?? null }));
      setDiretores(dir.sort((a, b) => a.nome.localeCompare(b.nome)));
      setSuperintendentes(sup.sort((a, b) => a.nome.localeCompare(b.nome)));
      setGerentes(((gers ?? []) as any[]).map((g) => ({ id: g.id, nome: g.nome, superintendente_id: g.superintendente_id })).sort((a, b) => a.nome.localeCompare(b.nome)));
      setLoading(false);
    })();
  }, []);

  /** Superintendentes filtrados pelo diretor selecionado (nome). "todos" = sem filtro */
  const supsByDiretorNome = (diretorNome: string) => {
    if (!diretorNome || diretorNome === "todos" || diretorNome === "__all") return superintendentes;
    const d = diretores.find((x) => x.nome === diretorNome);
    if (!d) return superintendentes;
    return superintendentes.filter((s) => s.diretor_id === d.id);
  };

  /** Gerentes filtrados pelo superintendente selecionado (nome). "todos" = todos os gerentes */
  const gerentesBySupNome = (supNome: string) => {
    if (!supNome || supNome === "todos" || supNome === "__all") return gerentes;
    const s = superintendentes.find((x) => x.nome === supNome);
    if (!s) return gerentes;
    return gerentes.filter((g) => g.superintendente_id === s.id);
  };

  /** Lista encadeada por (diretor, superintendente) */
  const gerentesByDiretorSup = (diretorNome: string, supNome: string) => {
    let sups = supsByDiretorNome(diretorNome);
    if (supNome && supNome !== "todos" && supNome !== "__all") {
      sups = sups.filter((s) => s.nome === supNome);
    }
    const supIds = new Set(sups.map((s) => s.id));
    return gerentes.filter((g) => supIds.has(g.superintendente_id));
  };

  return {
    loading,
    diretores,
    superintendentes,
    gerentes,
    supsByDiretorNome,
    gerentesBySupNome,
    gerentesByDiretorSup,
  };
}