-- ============================================================
-- COMPLETE RLS POLICY RESET — fixes infinite recursion
-- The root cause: boards SELECT checks board_members, and
-- board_members SELECT checks boards → circular dependency.
-- Fix: use a SECURITY DEFINER helper to check ownership
-- without triggering RLS on the boards table.
-- ============================================================

-- ============================================================
-- 0. HELPER FUNCTION (bypasses RLS to break the cycle)
-- ============================================================
create or replace function public.is_board_owner(check_board_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.boards where id = check_board_id and owner_id = auth.uid()
  );
$$;

create or replace function public.is_board_member(check_board_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.board_members where board_id = check_board_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_board_editor(check_board_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.board_members where board_id = check_board_id and user_id = auth.uid() and role = 'editor'
  );
$$;

-- ============================================================
-- 1. BOARDS POLICIES (drop all, recreate)
-- ============================================================
drop policy if exists "Authenticated users can read any board" on public.boards;
drop policy if exists "Users can read own boards" on public.boards;
drop policy if exists "boards_select_owner_or_member" on public.boards;
drop policy if exists "boards_select" on public.boards;
drop policy if exists "Users can create boards" on public.boards;
drop policy if exists "boards_insert_owner" on public.boards;
drop policy if exists "boards_insert" on public.boards;
drop policy if exists "Users can update own boards" on public.boards;
drop policy if exists "boards_update_owner" on public.boards;
drop policy if exists "boards_update" on public.boards;
drop policy if exists "Users can delete own boards" on public.boards;
drop policy if exists "boards_delete_owner" on public.boards;
drop policy if exists "boards_delete" on public.boards;

-- SELECT: owner or shared member (uses SECURITY DEFINER to avoid recursion)
create policy "boards_select"
  on public.boards for select
  using (
    owner_id = auth.uid()
    or is_board_member(id)
  );

-- INSERT: owner only
create policy "boards_insert"
  on public.boards for insert
  with check (auth.uid() = owner_id);

-- UPDATE: owner only
create policy "boards_update"
  on public.boards for update
  using (auth.uid() = owner_id);

-- DELETE: owner only
create policy "boards_delete"
  on public.boards for delete
  using (auth.uid() = owner_id);

-- ============================================================
-- 2. BOARD ELEMENTS POLICIES (drop all, recreate)
-- ============================================================
drop policy if exists "Authenticated users can read elements" on public.board_elements;
drop policy if exists "Authenticated users can insert elements" on public.board_elements;
drop policy if exists "Authenticated users can update elements" on public.board_elements;
drop policy if exists "Authenticated users can delete elements" on public.board_elements;
drop policy if exists "Creator can delete own elements" on public.board_elements;
drop policy if exists "board_elements_select" on public.board_elements;
drop policy if exists "board_elements_insert" on public.board_elements;
drop policy if exists "board_elements_update" on public.board_elements;
drop policy if exists "board_elements_delete" on public.board_elements;

-- SELECT: board owner or member (uses helpers)
create policy "board_elements_select"
  on public.board_elements for select
  using (
    is_board_owner(board_id) or is_board_member(board_id)
  );

-- INSERT: created_by = current user AND owner or editor
create policy "board_elements_insert"
  on public.board_elements for insert
  with check (
    auth.uid() = created_by
    and (is_board_owner(board_id) or is_board_editor(board_id))
  );

-- UPDATE: board owner or editor
create policy "board_elements_update"
  on public.board_elements for update
  using (
    is_board_owner(board_id) or is_board_editor(board_id)
  );

-- DELETE: only the element creator
create policy "board_elements_delete"
  on public.board_elements for delete
  using (auth.uid() = created_by);

-- ============================================================
-- 3. BOARD MEMBERS POLICIES (drop all, recreate)
-- ============================================================
drop policy if exists "board_members_select" on public.board_members;
drop policy if exists "board_members_insert" on public.board_members;
drop policy if exists "board_members_update" on public.board_members;
drop policy if exists "board_members_delete" on public.board_members;

-- SELECT: board owner or you are the member row
create policy "board_members_select"
  on public.board_members for select
  using (
    is_board_owner(board_id) or user_id = auth.uid()
  );

-- INSERT: board owner only
create policy "board_members_insert"
  on public.board_members for insert
  with check (
    is_board_owner(board_id)
  );

-- UPDATE: board owner only
create policy "board_members_update"
  on public.board_members for update
  using (
    is_board_owner(board_id)
  );

-- DELETE: board owner only
create policy "board_members_delete"
  on public.board_members for delete
  using (
    is_board_owner(board_id)
  );

-- ============================================================
-- 4. RPC for share-by-email
-- ============================================================
create or replace function public.get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where email = user_email limit 1;
$$;
