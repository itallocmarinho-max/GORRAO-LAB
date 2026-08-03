import { createFileRoute } from "@tanstack/react-router";
import { CyberComingSoon } from "@/components/cyber/CyberComingSoon";

export const Route = createFileRoute("/_app/admin/")({
  head: () => ({
    meta: [{ title: "Admin — DIRETORIA GORRÃO" }],
  }),
  component: AdminPlaceholder,
});

function AdminPlaceholder() {
  return (
    <CyberComingSoon kicker="ADMIN" title="Painel Admin" message="Esta página será refeita em breve" />
  );
}