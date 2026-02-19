-- Board chat: messages from users on the same board (for collaborators to talk while viewing)
create table if not exists public.board_chat_messages (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists board_chat_messages_board_id_idx on public.board_chat_messages(board_id);
create index if not exists board_chat_messages_created_at_idx on public.board_chat_messages(created_at);

alter table public.board_chat_messages enable row level security;

-- Can read messages if user can access the board (owner or member)
create policy "board_chat_select"
  on public.board_chat_messages for select
  using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
    or exists (select 1 from public.board_members m where m.board_id = board_chat_messages.board_id and m.user_id = auth.uid())
  );

-- Can insert own message if user can access the board
create policy "board_chat_insert"
  on public.board_chat_messages for insert
  with check (
    user_id = auth.uid()
    and (
      exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
      or exists (select 1 from public.board_members m where m.board_id = board_chat_messages.board_id and m.user_id = auth.uid())
    )
  );

-- Realtime: send new rows to subscribed clients
alter table public.board_chat_messages replica identity full;
-- Add table to Realtime publication (Supabase Cloud). If this fails, enable in Dashboard: Database → Realtime → add table board_chat_messages.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.board_chat_messages';
  end if;
exception when others then
  null; -- ignore if already added or publication missing
end $$;
