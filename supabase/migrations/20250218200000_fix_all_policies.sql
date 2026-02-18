-- ============================================================
-- COMPLETE RLS POLICY RESET
-- Drops ALL existing policies and recreates them cleanly.
-- Run this once in Supabase SQL Editor to fix any policy conflicts.
-- ============================================================

-- ============================================================
-- 1. BOARDS POLICIES (drop all, recreate)
-- ============================================================
drop policy if exists "Authenticated users can read any board" on public.boards;
drop policy if exists "Users can read own boards" on public.boards;
drop policy if exists "boards_select_owner_or_member" on public.boards;
drop policy if exists "Users can create boards" on public.boards;
drop policy if exists "boards_insert_owner" on public.boards;
drop policy if exists "Users can update own boards" on public.boards;
drop policy if exists "boards_update_owner" on public.boards;
drop policy if exists "Users can delete own boards" on public.boards;
drop policy if exists "boards_delete_owner" on public.boards;

-- SELECT: owner or shared member
create policy "boards_select"
  on public.boards for select
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.board_members m where m.board_id = id and m.user_id = auth.uid())
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

-- SELECT: board owner or member
create policy "board_elements_select"
  on public.board_elements for select
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_elements.board_id and m.user_id = auth.uid())
  );

-- INSERT: created_by must be current user AND must be owner or editor
create policy "board_elements_insert"
  on public.board_elements for insert
  with check (
    auth.uid() = created_by
    and (
      exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
      or exists (select 1 from public.board_members m where m.board_id = board_elements.board_id and m.user_id = auth.uid() and m.role = 'editor')
    )
  );

-- UPDATE: board owner or editor member
create policy "board_elements_update"
  on public.board_elements for update
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_elements.board_id and m.user_id = auth.uid() and m.role = 'editor')
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

-- SELECT: board owner or you are a member
create policy "board_members_select"
  on public.board_members for select
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or user_id = auth.uid()
  );

-- INSERT: board owner only (share API uses service role, so this also works)
create policy "board_members_insert"
  on public.board_members for insert
  with check (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  );

-- UPDATE: board owner only
create policy "board_members_update"
  on public.board_members for update
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  );

-- DELETE: board owner only
create policy "board_members_delete"
  on public.board_members for delete
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  );

-- ============================================================
-- 4. RPC (recreate for safety)
-- ============================================================
create or replace function public.get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where email = user_email limit 1;
$$;
