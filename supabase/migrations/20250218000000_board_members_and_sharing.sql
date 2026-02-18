-- Board members: who has access to a board (owner is in boards.owner_id; members are here)
create table if not exists public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id),
  unique (board_id, user_id)
);

create index if not exists board_members_user_id_idx on public.board_members(user_id);
create index if not exists board_members_board_id_idx on public.board_members(board_id);

alter table public.board_members enable row level security;

-- Only board owner or existing members can see members
create policy "board_members_select"
  on public.board_members for select
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_members.board_id and m.user_id = auth.uid())
  );

-- Only board owner can insert/update/delete members
create policy "board_members_insert"
  on public.board_members for insert
  with check (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy "board_members_update"
  on public.board_members for update
  using (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy "board_members_delete"
  on public.board_members for delete
  using (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));

-- Boards: allow select if owner OR member (replace open read policy)
drop policy if exists "Authenticated users can read any board" on public.boards;
create policy "boards_select_owner_or_member"
  on public.boards for select
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.board_members m where m.board_id = boards.id and m.user_id = auth.uid())
  );

-- Board elements: allow select/insert/update/delete if user can access the board (owner or editor)
drop policy if exists "Authenticated users can read elements" on public.board_elements;
drop policy if exists "Authenticated users can insert elements" on public.board_elements;
drop policy if exists "Authenticated users can update elements" on public.board_elements;
drop policy if exists "Creator can delete own elements" on public.board_elements;

create policy "board_elements_select"
  on public.board_elements for select
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_elements.board_id and m.user_id = auth.uid())
  );

create policy "board_elements_insert"
  on public.board_elements for insert
  with check (
    auth.uid() = created_by
    and (
      exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
      or exists (select 1 from public.board_members m where m.board_id = board_elements.board_id and m.user_id = auth.uid() and m.role = 'editor')
    )
  );

create policy "board_elements_update"
  on public.board_elements for update
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_elements.board_id and m.user_id = auth.uid() and m.role = 'editor')
  );

create policy "board_elements_delete"
  on public.board_elements for delete
  using (auth.uid() = created_by);

-- RPC: get user id by email (for share-by-email). Requires service role or definer runs as postgres.
create or replace function public.get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where email = user_email limit 1;
$$;
