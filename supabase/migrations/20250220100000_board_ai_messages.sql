-- AI chat messages per board (24h retention). One thread per board.
create table if not exists public.board_ai_messages (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists board_ai_messages_board_id_idx on public.board_ai_messages(board_id);
create index if not exists board_ai_messages_created_at_idx on public.board_ai_messages(created_at);

alter table public.board_ai_messages enable row level security;

-- Can read if user can access the board
create policy "board_ai_messages_select"
  on public.board_ai_messages for select
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_ai_messages.board_id and m.user_id = auth.uid())
  );

-- Can insert if user can access the board (user sends messages; assistant messages inserted by API with service role or same user)
create policy "board_ai_messages_insert"
  on public.board_ai_messages for insert
  with check (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_ai_messages.board_id and m.user_id = auth.uid())
  );
