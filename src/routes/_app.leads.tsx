import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { leadsResumoUser } from "@/functions/leads.functions";
import { ResumoTab } from "./_app.admin.leads";
import { CyberBackdrop } from "@/components/CyberBackdrop";
import { CyberHeading } from "@/components/cyber/CyberHeading";

export const Route = createFileRoute("/_app/leads")({ component: LeadsResumoPage });

type Lead = {
  id: string;
  nome_original: string;
  nome_normalizado: string;
  produto_id: string | null;
  produto_sugerido_id: string | null;
  score: number;
  status: string;
  created_at: string;
  gerente: string | null;
  superintendente: string | null;
  fonte: string | null;
  canal: string | null;
  responsavel: string | null;
  contagem: number | null;
};
type Produto = { id: string; nome: string; ativo?: boolean };

function LeadsResumoPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    if (!token) return;
    setLoading(true);
    try {
      const r = (await leadsResumoUser({ data: { token } })) as { leads: Lead[]; produtos: Produto[] };
      setLeads(r.leads);
      setProdutos(r.produtos);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [token]);

  return (
    <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10">
      <CyberBackdrop />
      <div className="relative z-10 space-y-6">
      <CyberHeading
        kicker="C2S"
        title="C2S"
        subtitle="Resumo da sua hierarquia (somente leitura)"
        right={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        }
      />

      {!leads.length && !loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum lead disponível para sua hierarquia.
          </CardContent>
        </Card>
      ) : (
        <ResumoTab leads={leads} produtos={produtos} />
      )}
      </div>
    </div>
  );
}
