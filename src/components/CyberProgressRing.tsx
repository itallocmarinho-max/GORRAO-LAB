import type { ReactNode } from "react";

type CyberProgressRingProps = {
  percentual: number;
  valor: ReactNode;
  rotulo: string;
  cor?: string;
  ariaLabel?: string;
  tamanho?: "padrao" | "grande";
};

/** Padrão oficial de gráfico pizza/anel do projeto. */
export function CyberProgressRing({
  percentual,
  valor,
  rotulo,
  cor = "#39FF14",
  ariaLabel,
  tamanho = "padrao",
}: CyberProgressRingProps) {
  const preenchimento = Math.min(Math.max(percentual, 0), 100);
  const grande = tamanho === "grande";

  return (
    <div
      className={`relative mx-auto ${grande ? "h-48 w-48" : "h-40 w-40"}`}
      role="img"
      aria-label={ariaLabel ?? `${rotulo}: ${String(valor)}`}
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke={cor}
          strokeWidth="5"
          strokeLinecap="square"
          strokeDasharray={`${preenchimento * 3.1416} 314.16`}
          className="drop-shadow-[0_0_5px_rgba(57,255,20,.7)] transition-all"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-mono font-light tabular-nums ${grande ? "text-4xl" : "text-3xl"}`}
          style={{ color: cor }}
        >
          {valor}
        </span>
        <span
          className={`mt-1 uppercase tracking-[0.15em] text-white/40 ${grande ? "text-[9px]" : "text-[7px]"}`}
        >
          {rotulo}
        </span>
      </div>
    </div>
  );
}
