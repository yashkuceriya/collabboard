-- Allow line elements in board_elements
alter table public.board_elements drop constraint if exists board_elements_type_check;
alter table public.board_elements add constraint board_elements_type_check
  check (type in ('sticky_note', 'rectangle', 'circle', 'text', 'frame', 'line', 'connector', 'freehand'));
