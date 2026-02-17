-- Give all authenticated users read access to any board so they can open shared links and sync.
-- Only the creator can delete a sticky note/element.
-- Run this in Supabase SQL Editor if you already ran the original schema (Dashboard > SQL Editor).

-- Remove owner-only read (so collab users can access the same board)
drop policy if exists "Users can read own boards" on public.boards;

-- Allow any authenticated user to read any board (shared collab access)
create policy "Authenticated users can read any board"
  on public.boards for select
  using (auth.role() = 'authenticated');

-- Only creator can delete elements (replace old "anyone can delete" policy)
drop policy if exists "Authenticated users can delete elements" on public.board_elements;
create policy "Creator can delete own elements"
  on public.board_elements for delete
  using (auth.uid() = created_by);
