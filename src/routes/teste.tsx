import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import fundoTopo from "@/assets/cabecalho.png";
import fundoBottom from "@/assets/fundo_bottom.png";
import bauxi from "@/assets/rodape_novo.png";


import {
  TrendingUp,
  Users,
  Heart,
  CheckCircle2,
  PlayCircle,
  ArrowRight,
  ArrowUpRight,
  Menu,
  X,
} from "lucide-react";

export const Route = createFileRoute("/teste")({
  head: () => ({
    meta: [
      { title: "GORRÃO // LAB — Performance Sem Limites" },
      { name: "description", content: "Estratégia, criatividade e dados em máquinas de vendas previsíveis e escaláveis." },
    ],
  }),
  component: TestePage,
});

const NEON = "#39FF14";

export function TestePage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    const onMove = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${e.clientX - 16}px, ${e.clientY - 16}px, 0)`;
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#000000] text-white font-sans antialiased selection:bg-[#39FF14] selection:text-black">
      {/* Custom cursor */}
      <div
        ref={cursorRef}
        className="pointer-events-none fixed top-0 left-0 z-[100] h-8 w-8 rounded-full hidden md:block"
        style={{
          background: "radial-gradient(circle, rgba(57,255,20,0.5) 0%, rgba(57,255,20,0) 70%)",
          mixBlendMode: "screen",
        }}
      />

      {/* Background particles + grid */}
      <Particles />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* NAVBAR */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? "backdrop-blur-xl bg-black/60 border-b border-white/5" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-sm border border-[#39FF14] flex items-center justify-center">
              <span className="text-[#39FF14] text-xs font-black">G</span>
            </div>
            <span className="text-xs tracking-[0.3em] font-bold text-white/90">GORRÃO // LAB</span>
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase border border-[#39FF14]/60 text-[#39FF14] px-4 py-2 hover:bg-[#39FF14] hover:text-black transition-all"
            style={{ boxShadow: "0 0 20px rgba(57,255,20,0.15)" }}
          >
            Entrar <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section id="inicio" className="relative min-h-screen flex items-center px-6 pt-20 pb-16 overflow-hidden">
        {/* Galáxia direita */}
        <img
          src={fundoTopo}
          alt=""
          aria-hidden
          className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover z-0 opacity-90"
        />
        {/* Glow neon esquerdo */}
        <div
          aria-hidden
          className="absolute -left-40 top-1/3 h-[600px] w-[600px] rounded-full z-0 pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(57,255,20,0.25) 0%, transparent 60%)", filter: "blur(40px)" }}
        />
        {/* Vinheta inferior */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#000000] z-[1]" />

        <div className="relative z-10 mx-auto max-w-7xl w-full grid md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7">

            <h1
              className="font-black uppercase leading-[0.85] text-white text-[clamp(2.5rem,7.5vw,6rem)]"
              style={{ fontStretch: "condensed", letterSpacing: "-0.02em" }}
            >
              <GlitchText>A GENTE CRIA</GlitchText>
              <br />
              <GlitchText>ESTRATÉGIAS</GlitchText>
              <br />
              <span className="text-white/60">PARA COLHER</span>
              <br />
              <span
                className="text-[#39FF14] font-hey-august"
                style={{
                  textShadow: "0 0 30px rgba(57,255,20,0.6), 0 0 60px rgba(57,255,20,0.3)",
                  transform: "rotate(-2deg)",
                  display: "inline-block",
                  fontWeight: 400,
                }}
              >
                RESULTADOS.
              </span>
            </h1>

            <p className="mt-8 max-w-xl text-base md:text-lg text-white/70 leading-relaxed">
              Um HUB completo, focado em alta performance, estratégia, planejamento e vendas.
            </p>

          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-[10px] tracking-[0.4em] uppercase text-white/40">
          Scroll
          <div className="h-8 w-px bg-gradient-to-b from-[#39FF14] to-transparent" />
        </div>
      </section>

      {/* MÉTRICAS */}
      <section className="relative py-24 px-6 border-y border-white/5">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex items-end justify-between flex-wrap gap-4">
            <div>
              <div className="text-[10px] tracking-[0.4em] uppercase text-[#39FF14] mb-3">// Métricas</div>
              <h2 className="font-black uppercase text-white text-[clamp(1.75rem,4vw,3rem)] leading-none">
                Números que <span className="text-[#39FF14] font-hey-august text-7xl" style={{ textShadow: "0 0 30px rgba(57,255,20,0.5)" }}>provam.</span>
              </h2>
            </div>
            <div className="text-xs tracking-widest uppercase text-[#39FF14]">Performance EM 2025</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: TrendingUp, value: "+1,2B", label: "DE VGV" },
              { icon: Users, value: "+4,2MIL", label: "UNIDADES VENDIDAS" },
              { icon: Heart, value: "+4,5M", label: "INVESTIDOS DIRETAMENTE NOS CORRETORES" },
              { icon: CheckCircle2, value: "+136MIL", label: "LEADS GERADOS" },
            ].map(({ icon: Icon, value, label }) => (
              <div
                key={label}
                className="group relative p-7 border border-white/10 bg-white/[0.02] backdrop-blur-md hover:border-[#39FF14]/60 transition-all"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
              >
                <Icon className="h-5 w-5 text-[#39FF14] mb-6" style={{ filter: "drop-shadow(0 0 8px rgba(57,255,20,0.6))" }} />
                <div className="text-3xl md:text-4xl font-black text-white mb-2 transition-all group-hover:text-[#39FF14]"
                     style={{ letterSpacing: "-0.02em" }}>
                  {value}
                </div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/50 leading-relaxed">{label}</div>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                     style={{ boxShadow: "inset 0 0 30px rgba(57,255,20,0.15)" }} />
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* MANIFESTO VIDEO */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden">
        <ManifestoVideo />
      </section>

      {/* MANIFESTO FINAL + FOOTER com fundo bauxi */}
      <div
        className="relative bg-no-repeat bg-bottom"
        style={{ backgroundImage: `url(${bauxi})`, backgroundSize: "100% auto" }}
      >
      <section id="sobre" className="relative py-40 px-6">
        <div className="mx-auto max-w-5xl text-center">
          <div className="text-[10px] tracking-[0.4em] uppercase text-[#39FF14] mb-12">// Manifesto</div>
          <div className="space-y-4">
            <h2 className="font-black uppercase text-white text-[clamp(2.5rem,7vw,6rem)] leading-[0.9]">
              NÃO SEGUIMOS
            </h2>
            <h2 className="font-black uppercase text-white text-[clamp(2.5rem,7vw,6rem)] leading-[0.9]">
              TENDÊNCIA
            </h2>
            <h2 className="font-black uppercase text-gray-400 text-[clamp(2.5rem,7vw,6rem)] leading-[0.9]">
              NÓS SOMOS
            </h2>
            <h2 className="font-hey-august text-[#39FF14] text-[clamp(2.5rem,7vw,6rem)] leading-[0.9]" style={{ textShadow: "0 0 50px rgba(57,255,20,0.6)" }}>
              TENDÊNCIA
            </h2>
          </div>
          <div className="mt-16 inline-block">
            <div className="h-16 w-16 mx-auto border-2 border-[#39FF14] rotate-45 animate-pulse"
                 style={{ boxShadow: "0 0 30px rgba(57,255,20,0.5), inset 0 0 20px rgba(57,255,20,0.2)" }} />
          </div>
        </div>
      </section>


      <footer className="border-t border-white/5 py-10 px-6 flex flex-wrap items-center justify-between gap-4 text-[10px] tracking-[0.3em] uppercase text-white/30">
        <div>© 2026 Gorrão Lab // Performance Sem Limites</div>
        <div className="flex gap-6">
          <a href="#inicio" className="hover:text-[#39FF14]">Início</a>
          <a href="#cases" className="hover:text-[#39FF14]">Cases</a>
          <a href="#contato" className="hover:text-[#39FF14]">Contato</a>
        </div>
      </footer>
      </div>
    </div>
  );
}


function GlitchText({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className="absolute inset-0 text-[#39FF14] opacity-30 mix-blend-screen"
        style={{ transform: "translate(2px, 0)", clipPath: "inset(0 0 60% 0)" }}
      >
        {children}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 text-pink-500 opacity-30 mix-blend-screen"
        style={{ transform: "translate(-2px, 0)", clipPath: "inset(60% 0 0 0)" }}
      >
        {children}
      </span>
    </span>
  );
}

function ManifestoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play();
    setPlaying(true);
  };

  return (
    <>
      <video
        ref={videoRef}
        src="/manifesto.mp4"
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        controls={playing}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
      />
      {!playing && (
        <>
          <div className="absolute inset-0 bg-black/75" />
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at center, transparent 0%, #000000 90%)" }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,1) 2px 3px)",
            }}
          />
          <div className="relative z-10 text-center px-6">
            <button
              onClick={handlePlay}
              className="mx-auto mb-10 h-24 w-24 rounded-full border-2 border-[#39FF14] flex items-center justify-center hover:scale-110 transition-transform group"
              style={{ boxShadow: "0 0 50px rgba(57,255,20,0.5)" }}
              aria-label="Play manifesto"
            >
              <PlayCircle className="h-12 w-12 text-[#39FF14] group-hover:scale-110 transition-transform" />
            </button>
            <div className="text-[10px] tracking-[0.4em] uppercase text-[#39FF14] mb-6">
              // Manifesto Visual
            </div>
            <h2 className="font-black uppercase text-white text-[clamp(2.5rem,7vw,6rem)] leading-[0.9]">
              NÓS CRIAMOS<br />
              <span className="text-[#39FF14]" style={{ textShadow: "0 0 50px rgba(57,255,20,0.7)" }}>
                O MOVIMENTO.
              </span>
            </h2>
          </div>
        </>
      )}
    </>
  );
}

function Particles() {
  const dots = Array.from({ length: 50 });
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {dots.map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-[#39FF14]"
          style={{
            width: `${Math.random() * 2 + 1}px`,
            height: `${Math.random() * 2 + 1}px`,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            opacity: Math.random() * 0.5 + 0.1,
            boxShadow: "0 0 6px #39FF14",
            animation: `float${i % 3} ${10 + Math.random() * 20}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes float0 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-40px) } }
        @keyframes float1 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(20px,-30px) } }
        @keyframes float2 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-15px,25px) } }
      `}</style>
    </div>
  );
}