-- Allow members to leave a board (delete their own row). Owner can still remove any member.
drop policy if exists "board_members_delete" on public.board_members;
create policy "board_members_delete"
  on public.board_members for delete
  using (
    is_board_owner(board_id)   -- owner can remove any member
    or user_id = auth.uid()   -- or you can remove yourself (leave board)
  );
