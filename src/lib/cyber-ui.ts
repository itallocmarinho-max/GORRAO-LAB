/**
 * Design system cyberpunk premium clean (Verba Cury).
 * Reuse these class strings nas demais abas para manter identidade visual
 * consistente sem duplicar código.
 *
 * Paleta: preto #050505/black-translucent + neon green #39FF14 + gray-400.
 * Estilo: rounded-none, borders neon a 30% de opacidade, uppercase tracking widest.
 */

export const NEON = "#39FF14";

// Page-level
export const cyberPageWrap =
  "relative space-y-8";

// Heading "// LABEL" tag
export const cyberKicker =
  "inline-flex items-center gap-2 mb-2 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-[#39FF14] border border-[#39FF14]/30 bg-black/40 backdrop-blur-md";

export const cyberHeadingTitle =
  "text-2xl md:text-3xl font-bold uppercase tracking-[0.2em] text-white";

export const cyberHeadingSubtitle =
  "text-xs uppercase tracking-[0.25em] text-gray-400";

// Cards
export const cyberCard =
  "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-300 shadow-[0_0_30px_-15px_rgba(57,255,20,0.4)]";

export const cyberCardHover =
  "transition hover:border-[#39FF14] hover:shadow-[0_0_40px_-10px_rgba(57,255,20,0.6)]";

// Inputs / Selects
export const cyberSelectTrigger =
  "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-400 hover:border-[#39FF14] focus:border-[#39FF14] focus:ring-0 uppercase tracking-widest text-[10px]";

export const cyberSelectContent =
  "rounded-none border border-[#39FF14]/30 bg-black/80 backdrop-blur-md text-gray-300";

export const cyberSelectItem =
  "rounded-none uppercase tracking-widest text-[10px] focus:bg-[#39FF14]/10 focus:text-[#39FF14] data-[state=checked]:text-[#39FF14] data-[state=checked]:bg-[#39FF14]/10";

export const cyberInput =
  "rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md text-gray-200 placeholder:text-gray-600 focus:border-[#39FF14] focus-visible:ring-0 uppercase tracking-widest text-xs";

// Buttons
export const cyberBtn =
  "rounded-none border border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14] hover:bg-[#39FF14] hover:text-black uppercase tracking-[0.2em] text-[10px] font-semibold transition-colors";

export const cyberBtnGhost =
  "rounded-none border border-[#39FF14]/30 bg-transparent text-gray-300 hover:border-[#39FF14] hover:text-[#39FF14] uppercase tracking-[0.2em] text-[10px] font-medium";

export const cyberBtnDanger =
  "rounded-none border border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-black uppercase tracking-[0.2em] text-[10px] font-semibold";

// Tabs (inline rolezinho)
export const cyberTabs =
  "inline-flex rounded-none border border-[#39FF14]/30 bg-black/60 backdrop-blur-md p-1";

export const cyberTabBtn = (active: boolean) =>
  `px-4 py-1.5 text-[10px] uppercase tracking-[0.25em] rounded-none transition-colors ${
    active
      ? "bg-[#39FF14] text-black font-bold"
      : "text-gray-400 hover:text-[#39FF14]"
  }`;

// Badges
export const cyberBadge =
  "rounded-none border border-[#39FF14]/40 bg-black/60 text-[#39FF14] uppercase tracking-[0.2em] text-[10px] font-medium";

export const cyberBadgeMuted =
  "rounded-none border border-white/10 bg-black/50 text-gray-300 uppercase tracking-[0.2em] text-[10px]";

// Tables
export const cyberTableWrap =
  "rounded-none border border-[#39FF14]/20 bg-black/40 backdrop-blur-md overflow-hidden";

export const cyberTableHead =
  "uppercase tracking-[0.2em] text-[10px] text-[#39FF14] border-b border-[#39FF14]/30";

// Empty / loading states
export const cyberEmpty =
  "flex flex-col items-center gap-2 py-16 text-center text-gray-500 uppercase tracking-[0.2em] text-[11px]";

// Stat tile (mini-card)
export const cyberStat =
  "rounded-none border border-[#39FF14]/20 bg-black/40 p-3";

export const cyberStatLabel =
  "text-[10px] uppercase tracking-[0.25em] text-[#39FF14]/70";

export const cyberStatValue =
  "text-lg font-bold text-gray-100";