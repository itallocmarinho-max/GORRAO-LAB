import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CyberProgressRing } from "@/components/CyberProgressRing";
import type { PastaVolumeRow } from "@/functions/google-sheets-pastas.functions";

type SupSummary = {
  name: string;
  total: number;
  withAb: number;
  rate: number;
};

function summarizeBySuper(rows: PastaVolumeRow[]): SupSummary[] {
  const groups = new Map<string, { total: number; withAb: number }>();
  for (const row of rows) {
    const name = row.superintendente?.trim() || "Não informado";
    const current = groups.get(name) ?? { total: 0, withAb: 0 };
    current.total += 1;
    if (row.tem_ab) current.withAb += 1;
    groups.set(name, current);
  }
  return [...groups.entries()]
    .map(([name, values]) => ({
      name,
      total: values.total,
      withAb: values.withAb,
      rate: values.total ? (values.withAb / values.total) * 100 : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function PastasOverview({
  rows,
  loading,
  abStored,
  showModuleLink = false,
  showSupVolume = true,
}: {
  rows: PastaVolumeRow[];
  loading: boolean;
  abStored: number;
  showModuleLink?: boolean;
  showSupVolume?: boolean;
}) {
  const total = rows.length;
  const withAb = rows.filter((row) => row.tem_ab).length;
  const withoutAb = total - withAb;
  const rate = total ? (withAb / total) * 100 : 0;
  const bySuper = summarizeBySuper(rows);

  return (
    <section className="space-y-3">
      {showModuleLink && (
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-[#39FF14]">/ / Pastas</div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.12em] text-white/30">
              Volume de PV e análises bancárias
            </div>
          </div>
          <Link
            to="/pastas"
            className="text-[8px] uppercase tracking-[0.14em] text-[#39FF14]/65 transition hover:text-[#39FF14]"
          >
            Abrir Pastas →
          </Link>
        </div>
      )}
      <div
        className={
          showSupVolume ? "grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]" : "grid gap-4"
        }
      >
        <Card className="overflow-hidden rounded-none border-[#39FF14]/25 bg-black/70">
          <CardContent className="grid min-h-[300px] place-items-center gap-6 p-6 sm:grid-cols-[220px_1fr]">
            {showModuleLink ? (
              <PastasRing total={total} rate={rate} loading={loading} />
            ) : (
              <div
                className="relative grid h-52 w-52 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#39FF14 0 ${rate}%, rgba(255,255,255,0.1) ${rate}% 100%)`,
                  boxShadow: "0 0 34px rgba(57,255,20,0.12)",
                }}
              >
                <div className="grid h-36 w-36 place-items-center rounded-full border border-white/10 bg-[#050505] text-center">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.22em] text-white/40">
                      Total de PV
                    </div>
                    <div className="mt-1 text-5xl font-light text-white">
                      {loading ? "—" : total}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="w-full space-y-5">
              <div>
                <div className="text-[9px] uppercase tracking-[0.22em] text-white/40">
                  Conversão para AB
                </div>
                <div className="mt-1 text-4xl font-light text-[#39FF14]">{rate.toFixed(1)}%</div>
              </div>
              <MetricLine label="PVs com AB" value={withAb} color="bg-[#39FF14]" />
              <MetricLine label="PVs sem AB" value={withoutAb} color="bg-white/25" />
              <div className="border-t border-white/10 pt-3 text-[9px] uppercase tracking-[0.16em] text-white/35">
                {abStored} análises armazenadas
              </div>
            </div>
          </CardContent>
        </Card>

        {showSupVolume && (
          <Card className="rounded-none border-[#39FF14]/25 bg-black/70">
            <CardHeader className="border-b border-white/10 pb-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.24em] text-white/35">
                    Volume por equipe
                  </div>
                  <CardTitle className="mt-1 text-sm uppercase tracking-[0.2em] text-[#39FF14]">
                    Superintendentes
                  </CardTitle>
                </div>
                <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">
                  {rows.length} registros nos filtros
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {bySuper.map((row) => (
                <div key={row.name} className="border border-white/10 bg-white/[0.025] p-3">
                  <div className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[#39FF14]">
                    {row.name}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniMetric label="PV" value={row.total} />
                    <MiniMetric label="Com AB" value={row.withAb} />
                    <MiniMetric label="% AB" value={`${row.rate.toFixed(0)}%`} />
                  </div>
                </div>
              ))}
              {!loading && !bySuper.length && (
                <div className="col-span-full grid min-h-44 place-items-center text-xs text-white/35">
                  Nenhuma PV encontrada nos filtros.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function PastasRing({ total, rate, loading }: { total: number; rate: number; loading: boolean }) {
  return (
    <CyberProgressRing
      percentual={rate}
      valor={loading ? "—" : total.toLocaleString("pt-BR")}
      rotulo="Total de PV"
    />
  );
}

function MetricLine({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
        <span className={`h-1.5 w-1.5 ${color}`} />
        {label}
      </div>
      <div className="text-2xl font-light text-white">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.14em] text-white/30">{label}</div>
      <div className="mt-0.5 text-lg font-light text-white">{value}</div>
    </div>
  );
}
