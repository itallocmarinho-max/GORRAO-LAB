## Resumo

Adicionar cargo `rh` em Usuários. Cada RH é vinculado a UM superintendente OU diretor. O RH cria e gerencia formulários **em nome** do vinculado: os registros são salvos com `usuario_id = vinculado`, então sup/diretor enxerga e edita normalmente (compartilhado), e os emails de validação/reprovação continuam indo para o sup/diretor. RH pode finalizar, devolver para edição e devolver após reprovado, mas não pode alterar nada depois de `validado` (apenas leitura).

## Banco de dados (migration)

1. Adicionar coluna `profiles.vinculado_id uuid` (id do sup ou diretor a quem o RH responde). Não usa `diretor_id` porque RH pode vincular a um sup também.
2. Atualizar trigger/check para permitir `cargo = 'rh'` (a coluna `profiles.cargo` é `text` livre, só precisa validar na app).
3. Criar função SECURITY DEFINER `public.is_rh_for(_uid uuid, _owner uuid)` → `cargo='rh' AND vinculado_id=_owner`.
4. Atualizar políticas RLS de **formularios**:
   - SELECT: adicionar `OR public.is_rh_for(auth.uid(), usuario_id)`.
   - INSERT: adicionar `OR (public.is_rh_for(auth.uid(), usuario_id))` (RH só insere com `usuario_id` = seu vinculado).
   - UPDATE: adicionar caso `public.is_rh_for(auth.uid(), usuario_id) AND status IN ('editando','finalizado','reprovado')`. Bloqueia `status='validado'`.
   - DELETE: adicionar `OR public.is_rh_for(auth.uid(), usuario_id)` quando status não-finalizado.
5. Atualizar políticas RLS de **lancamentos** (espelham via `formularios.usuario_id`): SELECT/INSERT/UPDATE/DELETE com EXISTS testando `is_rh_for(auth.uid(), f.usuario_id)` respeitando as mesmas regras de status.
6. Permitir RH gerenciar **gerentes** do superintendente vinculado (necessário para planejamento/acelera): policies em `gerentes` com `is_rh_for(auth.uid(), superintendente_id)`.

## Backend (server functions)

7. `admin-users.functions.ts`:
   - Adicionar `"rh"` ao `CargoEnum`.
   - `CreateInput.diretor_id` passa a aceitar id de sup ou diretor; no handler, gravar em `vinculado_id` quando `cargo='rh'` (gravar em `diretor_id` quando `cargo='superintendente'`).
   - `adminListUsers`: incluir `vinculado_id`.
   - Novo `adminUpdateUserVinculado` (espelha `adminUpdateUserDiretor`).

## Frontend

8. `src/hooks/useAuth.tsx`: estender `Cargo` com `"rh"`, expor `isRH` e `vinculadoId` (buscar `vinculado_id` no `fetchProfile`). `canEdit` segue como hoje (RH não é diretor → pode editar).
9. `src/routes/_app.admin.usuarios.tsx`: 
   - Adicionar opção "RH" nos dois Selects de cargo (criar/editar).
   - Quando `cargo='rh'`, mostrar Select "Vincular a (sup ou diretor)" listando todos os usuários com cargo `superintendente` ou `diretor`.
   - Coluna existente já mostra cargo via `Badge`.
10. `src/routes/_app.dashboard.tsx` (lista/criação de formulários):
    - Buscar o perfil do vinculado quando `isRH`.
    - Listagem: para RH, filtrar `usuario_id = vinculadoId` (já que RLS permite).
    - Criação: `usuario_id`, `nome`, `responsavel`, `diretor`, `superintendente` preenchidos a partir do **perfil do vinculado**, não do RH.
    - Permitir botões de "Criar", "Finalizar", "Devolver edição" para RH respeitando `status != 'validado'`.
11. `src/routes/_app.formularios.$id.tsx`:
    - Tratar RH como editor (`canEdit=true`) enquanto `status != 'validado'`.
    - Para `status='validado'`: forçar somente leitura para RH (igual a `isDiretor` hoje).
    - Botões de finalizar/devolver para edição/devolver após reprovado disponíveis para RH com as mesmas regras de status atuais.
12. Sidebar/menus: nenhum item novo — RH usa as mesmas abas (Verba Cury, Planejamento, etc.) que enxergam os formulários do vinculado.

## Email / notificações

13. `notify-verba.functions.ts` já busca o email pelo `usuario_id` do formulário. Como o RH cria com `usuario_id = vinculado`, o email continua indo para o sup/diretor automaticamente. **Sem mudanças.**

## Resumo dos arquivos alterados

- migration SQL nova
- `src/hooks/useAuth.tsx`
- `src/server/admin-users.functions.ts`
- `src/routes/_app.admin.usuarios.tsx`
- `src/routes/_app.dashboard.tsx`
- `src/routes/_app.formularios.$id.tsx`

Posso prosseguir?
