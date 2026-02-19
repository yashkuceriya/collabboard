-- Add is_starred column to boards for favorites/important boards
alter table public.boards add column if not exists is_starred boolean not null default false;
