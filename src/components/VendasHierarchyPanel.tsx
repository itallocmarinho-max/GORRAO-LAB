import { useEffect, useState } from "react";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  vendasHierarchyDelete,
  vendasHierarchyList,
  vendasHierarchyUpsert,
} from "@/functions/google-sheets-vendas.functions";

type HierarchyData = Awaited<ReturnType<typeof vendasHierarchyList>>;
type AliasRow = HierarchyData["diretores"][number];
type HierarquiaTipo = "diretor" | "superintendente" | "gerente";

const EXTERNAL = "__equipe_externa__";

export function VendasHierarchyPanel({ token }: { token: string }) {
  const [data, setData] = useState<HierarchyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await vendasHierarchyList({ data: { token } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar vínculos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const save = async (tipo: HierarquiaTipo, alias: string, value: string) => {
    setWorking(`${tipo}:${alias}`);
    try {
      await vendasHierarchyUpsert({
        data: {
          token,
          tipo,
          alias,
          destino_id: value === EXTERNAL ? null : value,
          externo: value === EXTERNAL,
        },
      });
      toast.success("Vínculo salvo e aplicado em Vendas e Pastas");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar vínculo");
    } finally {
      setWorking(null);
    }
  };

  const remove = async (tipo: HierarquiaTipo, row: AliasRow) => {
    setWorking(`${tipo}:${row.alias}`);
    try {
      await vendasHierarchyDelete({
        data: { token, tipo, alias_normalizado: row.alias_normalizado },
      });
      toast.success("Vínculo removido de Vendas e Pastas");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover vínculo");
    } finally {
      setWorking(null);
    }
  };

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-white/50">Carregando vínculos…</CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const alphabetical = <T extends { nome: string }>(items: T[]) =>
    [...items].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const directors = alphabetical(data.profiles.filter((profile) => profile.cargo === "diretor"));
  const directorName = new Map(directors.map((profile) => [profile.id, profile.nome]));
  const superintendents = alphabetical(
    data.profiles
      .filter((profile) => profile.cargo === "superintendente")
      .map((profile) => ({
        ...profile,
        subtitle: profile.diretor_id
          ? `Diretor: ${directorName.get(profile.diretor_id) ?? "não identificado"}`
          : "Diretor não vinculado",
      })),
  );
  const supName = new Map(superintendents.map((profile) => [profile.id, profile.nome]));
  const managerTargets = alphabetical(
    data.gerentesCadastro.map((manager) => ({
      id: manager.id,
      nome: manager.nome,
      subtitle: `Superintendente: ${supName.get(manager.superintendente_id) ?? "não identificado"}`,
    })),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Vínculos da hierarquia</CardTitle>
          <CardDescription>
            Cada nome aparece uma única vez, mesmo quando vem como principal e fifty. O vínculo é
            mantido como histórico e também é usado em Pastas. Marque Equipe externa para manter a
            venda visível sem levar esse nome aos números internos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <LinkCount label="Diretores" rows={data.diretores} />
          <LinkCount label="Superintendentes" rows={data.superintendentes} />
          <LinkCount label="Gerentes" rows={data.gerentes} />
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="ml-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </CardContent>
      </Card>
      <AliasCard
        title="Diretores"
        tipo="diretor"
        rows={data.diretores}
        targets={directors}
        working={working}
        onSave={save}
        onRemove={remove}
      />
      <AliasCard
        title="Superintendentes"
        tipo="superintendente"
        rows={data.superintendentes}
        targets={superintendents}
        working={working}
        onSave={save}
        onRemove={remove}
      />
      <AliasCard
        title="Gerentes"
        tipo="gerente"
        rows={data.gerentes}
        targets={managerTargets}
        working={working}
        onSave={save}
        onRemove={remove}
      />
    </div>
  );
}

function LinkCount({ label, rows }: { label: string; rows: AliasRow[] }) {
  const linked = rows.filter((row) => row.vinculado).length;
  return (
    <Badge variant="outline">
      {label}: {linked}/{rows.length} vinculados
    </Badge>
  );
}

function AliasCard({
  title,
  tipo,
  rows,
  targets,
  working,
  onSave,
  onRemove,
}: {
  title: string;
  tipo: HierarquiaTipo;
  rows: AliasRow[];
  targets: Array<{ id: string; nome: string; subtitle?: string }>;
  working: string | null;
  onSave: (tipo: HierarquiaTipo, alias: string, destinoId: string) => Promise<void>;
  onRemove: (tipo: HierarquiaTipo, row: AliasRow) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-white/10">
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-white/50">Nenhum nome encontrado nas planilhas.</p>
        ) : (
          rows.map((row) => (
            <AliasEditor
              key={row.alias_normalizado}
              tipo={tipo}
              row={row}
              targets={targets}
              busy={working === `${tipo}:${row.alias}`}
              onSave={onSave}
              onRemove={onRemove}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AliasEditor({
  tipo,
  row,
  targets,
  busy,
  onSave,
  onRemove,
}: {
  tipo: HierarquiaTipo;
  row: AliasRow;
  targets: Array<{ id: string; nome: string; subtitle?: string }>;
  busy: boolean;
  onSave: (tipo: HierarquiaTipo, alias: string, destinoId: string) => Promise<void>;
  onRemove: (tipo: HierarquiaTipo, row: AliasRow) => Promise<void>;
}) {
  const destination = tipo === "gerente" ? row.gerente_id : row.profile_id;
  const saved = row.externo ? EXTERNAL : destination;
  const [value, setValue] = useState(saved ?? row.suggested_id ?? "");

  useEffect(() => setValue(saved ?? row.suggested_id ?? ""), [saved, row.suggested_id]);

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-[220px] flex-1">
        <div className="font-medium">{row.alias}</div>
        <div className="text-xs text-white/50">
          {row.externo
            ? "Classificado como Equipe externa — fora dos números"
            : row.vinculado
              ? "Vinculado à equipe interna"
              : row.suggested_id
                ? "Sugestão automática — confirme"
                : "Pendente"}
        </div>
      </div>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-full sm:w-[320px]">
          <SelectValue placeholder="Selecione o cadastro interno" />
        </SelectTrigger>
        <SelectContent>
          {targets.map((target) => (
            <SelectItem key={target.id} value={target.id}>
              <span className="flex flex-col py-0.5">
                <span>{target.nome}</span>
                {target.subtitle && (
                  <span className="text-[10px] text-white/45">{target.subtitle}</span>
                )}
              </span>
            </SelectItem>
          ))}
          <SelectItem value={EXTERNAL}>Equipe externa</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!value || busy || (row.vinculado && value === saved)}
        onClick={() => onSave(tipo, row.alias, value)}
      >
        <Check className="mr-1 h-4 w-4" /> {row.vinculado ? "Atualizar" : "Confirmar"}
      </Button>
      {row.vinculado && (
        <Button size="icon" variant="ghost" disabled={busy} onClick={() => onRemove(tipo, row)}>
          <Trash2 className="h-4 w-4 text-red-400" />
        </Button>
      )}
    </div>
  );
}
