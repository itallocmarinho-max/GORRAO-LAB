import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CargoEnum = z.enum(["diretor", "superintendente", "administrador", "rh"]).nullable();

const CreateInput = z.object({
  token: z.string().min(1),
  email: z.string().email().max(255),
  password: z.string().min(6).max(100),
  role: z.enum(["user", "admin"]),
  nome: z.string().trim().min(1).max(120),
  cargo: CargoEnum.optional(),
  diretor_id: z.string().uuid().nullable().optional(),
  vinculado_id: z.string().uuid().nullable().optional(),
});

const ListInput = z.object({
  token: z.string().min(1),
});

const UpdateEmailInput = z.object({
  token: z.string().min(1),
  user_id: z.string().uuid(),
  email: z.string().email().max(255),
});

const UpdateNameInput = z.object({
  token: z.string().min(1),
  user_id: z.string().uuid(),
  nome: z.string().trim().min(1).max(120),
});

const UpdateCargoInput = z.object({
  token: z.string().min(1),
  user_id: z.string().uuid(),
  cargo: CargoEnum,
});

const UpdateDiretorInput = z.object({
  token: z.string().min(1),
  user_id: z.string().uuid(),
  diretor_id: z.string().uuid().nullable(),
});

const UpdateVinculadoInput = z.object({
  token: z.string().min(1),
  user_id: z.string().uuid(),
  vinculado_id: z.string().uuid().nullable(),
});

const UpdateAdminInput = z.object({
  token: z.string().min(1),
  user_id: z.string().uuid(),
  is_admin: z.boolean(),
});

const DeleteUserInput = z.object({
  token: z.string().min(1),
  user_id: z.string().uuid(),
});

async function assertAdmin(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Acesso negado");
  return data.user.id;
}

async function assertCanWrite(token: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Não autenticado");
  const { data: prof } = await supabaseAdmin
    .from("profiles").select("cargo").eq("id", data.user.id).maybeSingle();
  if ((prof as any)?.cargo === "diretor") {
    throw new Error("Perfil Diretor é somente leitura: sem permissão para criar, editar ou excluir.");
  }
  return data.user.id;
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const newId = created.user!.id;

    if (data.role === "admin") {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newId, role: "admin" });
    }
    await supabaseAdmin
      .from("profiles")
      .upsert({
        id: newId,
        email: data.email,
        nome: data.nome,
        cargo: data.cargo ?? null,
        diretor_id: data.diretor_id ?? null,
        vinculado_id: data.vinculado_id ?? null,
      }, { onConflict: "id" });
    return { id: newId, email: data.email };
  });

export const adminListUsers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: allRoles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: allProfiles } = await supabaseAdmin.from("profiles").select("id, nome, cargo, diretor_id, vinculado_id");
    return list.users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      nome: (allProfiles ?? []).find((p) => p.id === u.id)?.nome ?? null,
      cargo: (allProfiles ?? []).find((p) => p.id === u.id)?.cargo ?? null,
      diretor_id: (allProfiles ?? []).find((p) => p.id === u.id)?.diretor_id ?? null,
      vinculado_id: (allProfiles ?? []).find((p) => p.id === u.id)?.vinculado_id ?? null,
      roles: (allRoles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
    }));
  });

export const adminUpdateUserEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateEmailInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      email: data.email,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ email: data.email }).eq("id", data.user_id);
    return { ok: true };
  });

export const adminUpdateUserName = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateNameInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id,email")
      .eq("id", data.user_id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: data.user_id, nome: data.nome, email: existing?.email ?? null },
        { onConflict: "id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateUserCargo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateCargoInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id,email,nome")
      .eq("id", data.user_id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: data.user_id, cargo: data.cargo, email: existing?.email ?? null, nome: existing?.nome ?? null },
        { onConflict: "id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetUserAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateAdminInput.parse(input))
  .handler(async ({ data }) => {
    const callerId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    if (!data.is_admin && callerId === data.user_id) {
      throw new Error("Você não pode remover seu próprio acesso de admin");
    }
    if (data.is_admin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminUpdateUserDiretor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateDiretorInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id,email,nome")
      .eq("id", data.user_id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: data.user_id, diretor_id: data.diretor_id, email: existing?.email ?? null, nome: existing?.nome ?? null },
        { onConflict: "id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateUserVinculado = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateVinculadoInput.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin(data.token);
    await assertCanWrite(data.token);
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id,email,nome")
      .eq("id", data.user_id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: data.user_id, vinculado_id: data.vinculado_id, email: existing?.email ?? null, nome: existing?.nome ?? null },
        { onConflict: "id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteUserInput.parse(input))
  .handler(async ({ data }) => {
    const callerId = await assertAdmin(data.token);
    await assertCanWrite(data.token);
    if (callerId === data.user_id) {
      throw new Error("Você não pode excluir sua própria conta");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("gerentes").delete().eq("superintendente_id", data.user_id);
    await supabaseAdmin.from("profiles").update({ diretor_id: null }).eq("diretor_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
