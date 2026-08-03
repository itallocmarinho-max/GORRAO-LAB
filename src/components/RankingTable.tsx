import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface RankingRow {
  nome: string;
  total: number;
}

interface Props {
  rows: RankingRow[];
  label?: string;
  totalLabel?: string;
  formatter?: (v: number) => string;
}

export function RankingTable({ rows, label = "Nome", totalLabel = "Total", formatter }: Props) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  const max = Math.max(...rows.map((r) => r.total), 1);
  const fmt = formatter ?? ((v: number) => String(v));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 text-center">#</TableHead>
          <TableHead>{label}</TableHead>
          <TableHead>Distribuição</TableHead>
          <TableHead className="text-right w-28">{totalLabel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${r.nome}-${i}`}>
            <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">{r.nome}</TableCell>
            <TableCell>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(r.total / max) * 100}%` }}
                />
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums">{fmt(r.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
