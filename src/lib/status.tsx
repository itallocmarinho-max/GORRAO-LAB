import { Badge } from "@/components/ui/badge";

export type FormStatus = "editando" | "finalizado" | "validado" | "reprovado";

const MAP: Record<string, { label: string; className: string }> = {
  editando: { label: "Em aberto", className: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100" },
  finalizado: { label: "Finalizada", className: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100" },
  validado: { label: "Validada", className: "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100" },
  reprovado: { label: "Reprovada", className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100" },
};

export function StatusBadge({ status }: { status?: string | null }) {
  const s = MAP[status || "editando"] || MAP.editando;
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}
