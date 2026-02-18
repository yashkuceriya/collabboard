-- Ensure authenticated users can create/update/delete their own boards.
-- (The sharing migration only replaced SELECT; INSERT/UPDATE/DELETE may be missing.)

drop policy if exists "Users can create boards" on public.boards;
drop policy if exists "Users can update own boards" on public.boards;
drop policy if exists "Users can delete own boards" on public.boards;

create policy "boards_insert_owner"
  on public.boards for insert
  with check (auth.uid() = owner_id);

create policy "boards_update_owner"
  on public.boards for update
  using (auth.uid() = owner_id);

create policy "boards_delete_owner"
  on public.boards for delete
  using (auth.uid() = owner_id);
