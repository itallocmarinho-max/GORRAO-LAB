import { CyberHeading } from "./CyberHeading";
import { cyberCard } from "@/lib/cyber-ui";
import { Construction } from "lucide-react";

interface Props {
  kicker?: string;
  title: string;
  message?: string;
}

/**
 * Placeholder cyberpunk para páginas "Em breve".
 * Mantém identidade visual da Verba Cury sem incluir nenhuma lógica.
 */
export function CyberComingSoon({ kicker = "EM BREVE", title, message }: Props) {
  return (
    <div className="space-y-8">
      <CyberHeading kicker={kicker} title={title} />
      <div className={`${cyberCard} flex flex-col items-center justify-center gap-4 py-20 text-center`}>
        <div className="relative">
          <div className="absolute inset-0 blur-xl bg-[#39FF14]/30 rounded-full" />
          <Construction className="relative h-14 w-14 text-[#39FF14]" />
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-gray-400">
          {message ?? "Módulo em construção"}
        </p>
        <div className="mt-2 h-px w-24 bg-gradient-to-r from-transparent via-[#39FF14] to-transparent" />
      </div>
    </div>
  );
}