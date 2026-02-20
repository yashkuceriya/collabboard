-- Share board by link: anyone with the link can join with a chosen role (editor/viewer)
create table if not exists public.board_share_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists board_share_links_board_id_idx on public.board_share_links(board_id);
create index if not exists board_share_links_token_idx on public.board_share_links(token);

alter table public.board_share_links enable row level security;

-- Only board owner can see/create/delete share links for their board
create policy "board_share_links_select"
  on public.board_share_links for select
  using (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy "board_share_links_insert"
  on public.board_share_links for insert
  with check (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy "board_share_links_delete"
  on public.board_share_links for delete
  using (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));
