import { createFileRoute } from "@tanstack/react-router";
import { CyberComingSoon } from "@/components/cyber/CyberComingSoon";

export const Route = createFileRoute("/_app/superintendente")({
  component: SuperintendentePage,
});

function SuperintendentePage() {
  return <CyberComingSoon kicker="SUPERINTENDENTE" title="Superintendente" />;
}