-- Run once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- One table holds every collection (tracks, days, progress, ...) as JSON documents, one row per doc.
create table if not exists public.docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

alter table public.docs enable row level security;

drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Live sync between phone and laptop.
alter table public.docs replica identity full;
alter publication supabase_realtime add table public.docs;
