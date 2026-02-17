-- CollabBoard Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================================
-- 1. BOARDS TABLE
-- ============================================================
create table if not exists public.boards (
  id uuid default gen_random_uuid() primary key,
  name text not null default 'Untitled Board',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null
);

-- RLS for boards
alter table public.boards enable row level security;

-- Any authenticated user can read any board (shared collab access — open via link and sync)
create policy "Authenticated users can read any board"
  on public.boards for select
  using (auth.role() = 'authenticated');

-- Users can insert their own boards
create policy "Users can create boards"
  on public.boards for insert
  with check (auth.uid() = owner_id);

-- Users can update their own boards
create policy "Users can update own boards"
  on public.boards for update
  using (auth.uid() = owner_id);

-- Users can delete their own boards
create policy "Users can delete own boards"
  on public.boards for delete
  using (auth.uid() = owner_id);

-- ============================================================
-- 2. BOARD ELEMENTS TABLE
-- ============================================================
create table if not exists public.board_elements (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  type text not null check (type in ('sticky_note', 'rectangle', 'circle', 'text', 'frame', 'connector')),
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 150,
  height double precision not null default 150,
  color text not null default '#FFEB3B',
  text text not null default '',
  properties jsonb not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

-- Index for fast lookups by board
create index if not exists idx_board_elements_board_id on public.board_elements(board_id);

-- RLS for board_elements — anyone authenticated can read/write elements on any board (MVP)
-- Tighten with board_members table in days 3-7
alter table public.board_elements enable row level security;

-- All authenticated users can read elements (for real-time collaboration)
create policy "Authenticated users can read elements"
  on public.board_elements for select
  using (auth.role() = 'authenticated');

-- All authenticated users can insert elements
create policy "Authenticated users can insert elements"
  on public.board_elements for insert
  with check (auth.uid() = created_by);

-- All authenticated users can update elements (for collaborative editing)
create policy "Authenticated users can update elements"
  on public.board_elements for update
  using (auth.role() = 'authenticated');

-- Only the user who created an element can delete it
create policy "Creator can delete own elements"
  on public.board_elements for delete
  using (auth.uid() = created_by);

-- ============================================================
-- 3. ENABLE REALTIME
-- ============================================================
-- Enable realtime on board_elements so all clients get live updates
alter publication supabase_realtime add table public.board_elements;

-- ============================================================
-- 4. UPDATED_AT TRIGGER (for conflict resolution — last-write-wins)
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.board_elements
  for each row execute function public.handle_updated_at();
