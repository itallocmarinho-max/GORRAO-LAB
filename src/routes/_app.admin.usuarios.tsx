import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { pushUndo } from "@/lib/undo";
import { adminCreateUser, adminListUsers, adminUpdateUserEmail, adminUpdateUserName, adminUpdateUserCargo, adminSetUserAdmin, adminUpdateUserDiretor, adminUpdateUserVinculado, adminDeleteUser } from "@/functions/admin-users.functions";
import { Pencil, Users, Trash2, Plus, ArrowLeft } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import { CyberBackdrop } from "@/components/CyberBackdrop";

export const Route = createFileRoute("/_app/admin/usuarios")({
  component: UsersPage,
});

function UsersPage() {
  const { role, loading, canEdit, isDiretor } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [r, setR] = useState<"user" | "admin">("user");
  const [cargo, setCargo] = useState<"diretor" | "superintendente" | "administrador" | "rh" | "">("");
  const [diretorId, setDiretorId] = useState<string>("");
  const [vinculadoId, setVinculadoId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editCargo, setEditCargo] = useState<"diretor" | "superintendente" | "administrador" | "rh" | "">("");
  const [editDiretorId, setEditDiretorId] = useState<string>("");
  const [editVinculadoId, setEditVinculadoId] = useState<string>("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [gerSupId, setGerSupId] = useState<string | null>(null);
  const [gerSupNome, setGerSupNome] = useState<string>("");
  const [gerentes, setGerentes] = useState<Array<{ id: string; nome: string; ativo: boolean; inativo_mes: number | null; inativo_ano: number | null }>>([]);
  const [novoGerente, setNovoGerente] = useState("");
  const [gerBusy, setGerBusy] = useState(false);
  const [inativarId, setInativarId] = useState<string | null>(null);
  const [inativarMes, setInativarMes] = useState<string>(String(new Date().getMonth() + 1));
  const [inativarAno, setInativarAno] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    if (!loading && role !== "admin") navigate({ to: "/dashboard" });
  }, [role, loading, navigate]);

  const getToken = async () => {
    const clearAndRedirect = async (): Promise<never> => {
      await supabase.auth.signOut({ scope: "local" });
      navigate({ to: "/login" });
      throw new Error("Sessão expirada. Faça login novamente.");
    };

    const validated = await supabase.auth.getUser();
    if (validated.error || !validated.data.user) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session?.access_token) {
        await clearAndRedirect();
      }
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      await clearAndRedirect();
    }

    return token;
  };

  const load = async () => {
    try {
      const token = await getToken();
      const data = await adminListUsers({ data: { token } });
      setUsers(data);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    if (role === "admin") load();
  }, [role]);

  const loadGerentes = async (supId: string) => {
    const { data, error } = await supabase
      .from("gerentes")
      .select("id, nome, ativo, inativo_mes, inativo_ano")
      .eq("superintendente_id", supId)
      .order("nome");
    if (error) { toast.error(error.message); return; }
    setGerentes(data ?? []);
  };

  const openGerentes = async (u: any) => {
    setGerSupId(u.id);
    setGerSupNome(u.nome || u.email || "");
    setNovoGerente("");
    await loadGerentes(u.id);
  };

  const addGerente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gerSupId || !novoGerente.trim()) return;
    setGerBusy(true);
    const { error } = await supabase
      .from("gerentes")
      .insert({ superintendente_id: gerSupId, nome: novoGerente.trim() });
    setGerBusy(false);
    if (error) return toast.error(error.message);
    setNovoGerente("");
    loadGerentes(gerSupId);
  };

  const removerGerente = async (id: string) => {
    if (!gerSupId) return;
    const { data: snap } = await supabase.from("gerentes").select("*").eq("id", id);
    const { error } = await supabase.from("gerentes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    pushUndo("Gerente excluído", [{ table: "gerentes", rows: snap || [] }]);
    loadGerentes(gerSupId);
  };

  const toggleGerente = async (id: string, ativo: boolean) => {
    if (!gerSupId) return;
    if (!ativo) {
      // Abrir diálogo para capturar mês/ano de inativação
      setInativarMes(String(new Date().getMonth() + 1));
      setInativarAno(String(new Date().getFullYear()));
      setInativarId(id);
      return;
    }
    const { error } = await supabase
      .from("gerentes")
      .update({ ativo: true, inativo_mes: null, inativo_ano: null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    loadGerentes(gerSupId);
  };

  const confirmarInativar = async () => {
    if (!inativarId || !gerSupId) return;
    const mes = Number(inativarMes);
    const ano = Number(inativarAno);
    if (!mes || !ano || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) {
      toast.error("Informe mês (1-12) e ano válidos");
      return;
    }
    const { error } = await supabase
      .from("gerentes")
      .update({ ativo: false, inativo_mes: mes, inativo_ano: ano })
      .eq("id", inativarId);
    if (error) return toast.error(error.message);
    setInativarId(null);
    loadGerentes(gerSupId);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const token = await getToken();
      await adminCreateUser({ data: {
        token, email, password, role: r, nome,
        cargo: cargo || null,
        diretor_id: cargo === "superintendente" ? (diretorId || null) : null,
        vinculado_id: cargo === "rh" ? (vinculadoId || null) : null,
      } });
      toast.success("Usuário criado");
      setEmail(""); setPassword(""); setR("user"); setNome(""); setCargo(""); setDiretorId(""); setVinculadoId("");
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading || role !== "admin") return null;
  if (isDiretor) {
    return (
      <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10">
        <CyberBackdrop />
        <div className="relative z-10 mx-auto max-w-5xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
            // USUÁRIOS
          </div>
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-[#39FF14]/70">Seu perfil tem acesso somente de leitura e validação. Gerenciamento de usuários está disponível apenas para administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="verba-cyber relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#050505] text-white px-6 py-10">
      <CyberBackdrop />
      <div className="relative z-10 mx-auto max-w-5xl space-y-6">
      <div className="mb-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
          // USUÁRIOS
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/painel"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Novo usuário</Button>
          </DialogTrigger>
          <DialogContent className="verba-cyber">
            <DialogHeader><DialogTitle>Criar usuário</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={120} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label>Senha</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
              </div>
              <div>
                <Label>Perfil</Label>
                <Select value={r} onValueChange={(v) => setR(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cargo</Label>
                <Select value={cargo || "none"} onValueChange={(v) => setCargo(v === "none" ? "" : (v as any))}>
                  <SelectTrigger><SelectValue placeholder="Sem cargo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cargo</SelectItem>
                    <SelectItem value="diretor">Diretor</SelectItem>
                    <SelectItem value="superintendente">Superintendente</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="rh">RH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cargo === "superintendente" && (
                <div>
                  <Label>Diretor responsável</Label>
                  <Select value={diretorId || "none"} onValueChange={(v) => setDiretorId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione um diretor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem diretor</SelectItem>
                      {users.filter((u) => u.cargo === "diretor").map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {cargo === "rh" && (
                <div>
                  <Label>Vincular a (superintendente ou diretor)</Label>
                  <Select value={vinculadoId || "none"} onValueChange={(v) => setVinculadoId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione um superintendente ou diretor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem vínculo</SelectItem>
                      {users.filter((u) => u.cargo === "superintendente" || u.cargo === "diretor").map((u) => (
                        <SelectItem key={u.id} value={u.id}>{(u.nome || u.email)} — {u.cargo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Lista</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Perfis</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.cargo ? <Badge variant="outline">{u.cargo}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="space-x-1">
                    {u.roles.length === 0 && <Badge variant="secondary">user</Badge>}
                    {u.roles.map((rr: string) => (
                      <Badge key={rr} variant={rr === "admin" ? "default" : "secondary"}>{rr}</Badge>
                    ))}
                  </TableCell>
                  <TableCell>{u.created_at ? fmtDateTime(u.created_at) : "-"}</TableCell>
                  <TableCell className="flex items-center gap-1">
                    {u.cargo === "superintendente" && (
                      <Button variant="ghost" size="icon" onClick={() => openGerentes(u)} title="Gerenciar gerentes">
                        <Users className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditId(u.id);
                      setEditEmail(u.email || "");
                      setEditNome(u.nome || "");
                      setEditCargo((u.cargo as any) || "");
                    setEditDiretorId(u.diretor_id || "");
                    setEditVinculadoId(u.vinculado_id || "");
                      setEditIsAdmin(u.roles?.includes("admin") ?? false);
                    }} title="Editar usuário">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title="Excluir usuário">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="verba-cyber">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {u.nome || u.email} será removido permanentemente. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              try {
                                const token = await getToken();
                                await adminDeleteUser({ data: { token, user_id: u.id } });
                                toast.success("Usuário excluído");
                                load();
                              } catch (err: any) {
                                toast.error(err.message);
                              }
                            }}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!editId} onOpenChange={(o) => { if (!o) setEditId(null); }}>
        <DialogContent className="verba-cyber">
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editId) return;
              setBusy(true);
              try {
                const token = await getToken();
                await adminUpdateUserName({ data: { token, user_id: editId, nome: editNome } });
                await adminUpdateUserEmail({ data: { token, user_id: editId, email: editEmail } });
                await adminUpdateUserCargo({ data: { token, user_id: editId, cargo: (editCargo || null) as any } });
                await adminUpdateUserDiretor({ data: { token, user_id: editId, diretor_id: editCargo === "superintendente" ? (editDiretorId || null) : null } });
                await adminUpdateUserVinculado({ data: { token, user_id: editId, vinculado_id: editCargo === "rh" ? (editVinculadoId || null) : null } });
                await adminSetUserAdmin({ data: { token, user_id: editId, is_admin: editIsAdmin } });
                toast.success("Usuário atualizado");
                setEditId(null);
                load();
              } catch (err: any) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nome</Label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} required maxLength={120} />
            </div>
            <div>
              <Label>Novo email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
            </div>
            <div>
              <Label>Cargo</Label>
              <Select value={editCargo || "none"} onValueChange={(v) => setEditCargo(v === "none" ? "" : (v as any))}>
                <SelectTrigger><SelectValue placeholder="Sem cargo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cargo</SelectItem>
                  <SelectItem value="diretor">Diretor</SelectItem>
                  <SelectItem value="superintendente">Superintendente</SelectItem>
                  <SelectItem value="administrador">Administrador</SelectItem>
                  <SelectItem value="rh">RH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editCargo === "superintendente" && (
              <div>
                <Label>Diretor responsável</Label>
                <Select value={editDiretorId || "none"} onValueChange={(v) => setEditDiretorId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione um diretor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem diretor</SelectItem>
                    {users.filter((u) => u.cargo === "diretor" && u.id !== editId).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editCargo === "rh" && (
              <div>
                <Label>Vincular a (superintendente ou diretor)</Label>
                <Select value={editVinculadoId || "none"} onValueChange={(v) => setEditVinculadoId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione um superintendente ou diretor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {users.filter((u) => (u.cargo === "superintendente" || u.cargo === "diretor") && u.id !== editId).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{(u.nome || u.email)} — {u.cargo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Acesso administrador</Label>
                <p className="text-xs text-muted-foreground">Permite gerenciar usuários, leads e dados.</p>
              </div>
              <Switch checked={editIsAdmin} onCheckedChange={setEditIsAdmin} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!gerSupId} onOpenChange={(o) => { if (!o) { setGerSupId(null); setGerentes([]); } }}>
        <DialogContent className="verba-cyber">
          <DialogHeader><DialogTitle>Gerentes de {gerSupNome}</DialogTitle></DialogHeader>
          <form onSubmit={addGerente} className="flex gap-2">
            <Input
              value={novoGerente}
              onChange={(e) => setNovoGerente(e.target.value)}
              placeholder="Nome do gerente"
              maxLength={120}
            />
            <Button type="submit" disabled={gerBusy || !novoGerente.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </form>
          <div className="max-h-[50vh] overflow-auto border rounded-md">
            {gerentes.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Nenhum gerente cadastrado</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-24">Ativo</TableHead>
                    <TableHead>Inativo desde</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gerentes.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>{g.nome}</TableCell>
                      <TableCell><Switch checked={g.ativo} onCheckedChange={(v) => toggleGerente(g.id, v)} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {!g.ativo && g.inativo_mes && g.inativo_ano
                          ? `${String(g.inativo_mes).padStart(2, "0")}/${g.inativo_ano}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removerGerente(g.id)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!inativarId} onOpenChange={(o) => { if (!o) setInativarId(null); }}>
        <DialogContent className="verba-cyber">
          <DialogHeader><DialogTitle>Inativar gerente a partir de</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Até o mês/ano informado o gerente continua disponível para novos lançamentos.
            Depois disso ele aparece apenas em filtros de dados antigos (histórico).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês</Label>
              <Select value={inativarMes} onValueChange={setInativarMes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Input
                type="number"
                value={inativarAno}
                onChange={(e) => setInativarAno(e.target.value)}
                min={2000}
                max={2100}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInativarId(null)}>Cancelar</Button>
            <Button onClick={confirmarInativar}>Confirmar inativação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
