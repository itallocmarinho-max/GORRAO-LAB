import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { ContabilHistorico } from "@/components/ContabilHistorico";
import { useAuth } from "@/hooks/useAuth";
import { useHierarquia } from "@/hooks/useHierarquia";
import { contabilList } from "@/functions/contabil.functions";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_app/admin/contabil")({ component: AdminContabil });

type Row = {
  id: string;
  pv: string;
  empreendimento: string | null;
  torre: string | null;
  unidade: string | null;
  gerente: string | null;
  superintendente: string | null;
  diretor: string | null;
  vgv: number;
  quantidade: number;
  mes: number;
  ano: number;
  canal: string | null;
  cidade: string | null;
  regiao: string | null;
  plantao: string | null;
  origem: string;
};

function AdminContabil() {
  const { role, loading: authLoading, session } = useAuth();
  const { diretores, superintendentes, gerentes } = useHierarquia();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const token = session?.access_token || "";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await contabilList({ data: { token } });
      setRows(result.rows as Row[]);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar o CONTÁBIL");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (role === "admin" && token) void load();
  }, [role, token, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.pv,
        row.empreendimento,
        row.gerente,
        row.superintendente,
        row.diretor,
        row.plantao,
        row.cidade,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [rows, search]);
  const quantity = filtered.reduce((sum, row) => sum + Number(row.quantidade || 0), 0);
  const vgv = filtered.reduce((sum, row) => sum + Number(row.vgv || 0), 0);

  if (authLoading) return null;
  if (role !== "admin") return <div className="p-6">Acesso restrito.</div>;

  return (
    <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] px-6 py-10 text-white">
      <CyberBackdrop />
      <div className="relative z-10 mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3 text-white/60">
              <Link to="/admin/painel">
                <ArrowLeft className="mr-1 h-4 w-4" /> Painel
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center border border-[#39FF14]/40 bg-[#39FF14]/10 text-[#39FF14]">
                <Calculator className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">CONTÁBIL</h1>
                <p className="mt-1 text-xs text-white/45">
                  Base oficial de leitura para o Planejamento
                </p>
              </div>
            </div>
          </div>
          {token && (
            <ContabilHistorico
              token={token}
              diretores={diretores}
              superintendentes={superintendentes}
              gerentes={gerentes}
              onImported={load}
            />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border border-white/10 bg-black/60 p-4">
            <div className="text-[9px] uppercase tracking-[.18em] text-white/40">
              Registros armazenados
            </div>
            <div className="mt-2 font-mono text-3xl text-white">
              {total.toLocaleString("pt-BR")}
            </div>
          </div>
          <div className="border border-white/10 bg-black/60 p-4">
            <div className="text-[9px] uppercase tracking-[.18em] text-white/40">
              Quantidade exibida
            </div>
            <div className="mt-2 font-mono text-3xl text-[#39FF14]">
              {quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="border border-white/10 bg-black/60 p-4">
            <div className="text-[9px] uppercase tracking-[.18em] text-white/40">VGV exibido</div>
            <div className="mt-2 font-mono text-3xl text-[#39FF14]">{brl(vgv)}</div>
          </div>
        </div>

        <section className="border border-[#39FF14]/25 bg-black/65 p-4 backdrop-blur-xl">
          <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[.22em] text-[#39FF14]">
                / / Dados contábeis
              </h2>
              <p className="mt-1 text-[9px] uppercase tracking-wider text-white/35">
                Exibindo até 1.000 registros mais recentes
              </p>
            </div>
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar PV, empreendimento ou hierarquia..."
                className="rounded-none border-white/15 bg-black/60 pl-9"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-[10px]">
              <thead>
                <tr className="border-b border-white/10 text-left uppercase tracking-wider text-white/40">
                  {[
                    "PV",
                    "Período",
                    "Empreendimento",
                    "Torre / unidade",
                    "Gerente",
                    "SUP",
                    "Diretor",
                    "Quantidade",
                    "VGV",
                    "Canal",
                    "Cidade / região",
                    "Plantão",
                    "Origem",
                  ].map((head) => (
                    <th key={head} className="px-3 py-3">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-white/40">
                      Carregando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-white/40">
                      Nenhum registro encontrado
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="border-b border-white/[.06] hover:bg-white/[.025]">
                      <td className="px-3 py-3 font-mono text-[#39FF14]">{row.pv}</td>
                      <td className="px-3 py-3">
                        {String(row.mes).padStart(2, "0")}/{row.ano}
                      </td>
                      <td className="px-3 py-3">{row.empreendimento || "—"}</td>
                      <td className="px-3 py-3">
                        {[row.torre, row.unidade].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-3 py-3">{row.gerente || "—"}</td>
                      <td className="px-3 py-3">{row.superintendente || "—"}</td>
                      <td className="px-3 py-3">{row.diretor || "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-white">
                        {Number(row.quantidade || 0).toLocaleString("pt-BR", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {brl(Number(row.vgv || 0))}
                      </td>
                      <td className="px-3 py-3">{row.canal || "—"}</td>
                      <td className="px-3 py-3">
                        {[row.cidade, row.regiao].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-3 py-3">{row.plantao || "—"}</td>
                      <td className="px-3 py-3 uppercase text-white/40">
                        {row.origem === "historico" ? "Histórico" : "Sheets"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
