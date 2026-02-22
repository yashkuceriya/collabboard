-- Version history: snapshots of board_elements for restore. Retention: last 50 per board (application-level).
create table if not exists public.board_version_snapshots (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  snapshot jsonb not null
);

create index if not exists board_version_snapshots_board_id_idx on public.board_version_snapshots(board_id);
create index if not exists board_version_snapshots_created_at_idx on public.board_version_snapshots(created_at desc);

alter table public.board_version_snapshots enable row level security;

-- Can read if user can access the board
create policy "board_version_snapshots_select"
  on public.board_version_snapshots for select
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_version_snapshots.board_id and m.user_id = auth.uid())
  );

-- Can insert if user can access the board (owner or member creates snapshots)
create policy "board_version_snapshots_insert"
  on public.board_version_snapshots for insert
  with check (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_version_snapshots.board_id and m.user_id = auth.uid())
  );
