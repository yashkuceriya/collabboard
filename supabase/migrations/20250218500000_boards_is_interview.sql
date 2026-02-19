-- Board type: interview board (interview prep tools) vs normal whiteboard
alter table public.boards add column if not exists is_interview boolean not null default false;
