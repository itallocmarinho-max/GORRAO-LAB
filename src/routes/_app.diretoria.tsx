import { createFileRoute } from "@tanstack/react-router";
import { CyberComingSoon } from "@/components/cyber/CyberComingSoon";

export const Route = createFileRoute("/_app/diretoria")({
  component: DiretoriaPage,
});

function DiretoriaPage() {
  return <CyberComingSoon kicker="DIRETORIA" title="Diretoria" />;
}