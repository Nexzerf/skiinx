-- 001_init: tables + RLS for Skiinx
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.schedules (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  data        jsonb not null,             -- Schedule JSON (design §4)
  start_date  date not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.checkins (
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  date     date not null,                 -- logical date (day flips at 04:00)
  slot     text not null check (slot in ('am','pm')),
  done_at  timestamptz not null default now(),
  source   text not null default 'app' check (source in ('app','discord','push','manual')),
  primary key (user_id, date, slot)
);

create table public.skin_logs (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  date         date not null,
  acne         smallint check (acne between 1 and 5),
  oil          smallint check (oil between 1 and 5),
  irritation   smallint check (irritation between 1 and 5),
  overall      smallint check (overall between 1 and 5),
  note         text,
  photo_angles text[] not null default '{}',  -- metadata only — photos never leave the phone
  ai           jsonb,                         -- on-device metrics (redness a*, spot count, shine %) — numbers only
  updated_at   timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.settings (
  user_id            uuid primary key default auth.uid() references auth.users on delete cascade,
  data               jsonb not null default '{}',   -- merged over DEFAULT_SETTINGS in core.js
  ics_token          text not null default replace(gen_random_uuid()::text, '-', ''),
  discord_dm_channel text,
  updated_at         timestamptz not null default now()
);

create table public.reminder_state (
  user_id      uuid not null references auth.users on delete cascade,
  date         date not null,
  slot         text not null check (slot in ('am','pm')),
  sent_count   int not null default 0,
  last_sent    timestamptz,
  snooze_until timestamptz,
  primary key (user_id, date, slot)
);

-- one row per device that allowed notifications (Web Push)
create table public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  token       text not null default replace(gen_random_uuid()::text, '-', ''),  -- lets notification buttons act without a login
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.schedules          enable row level security;
alter table public.checkins           enable row level security;
alter table public.skin_logs          enable row level security;
alter table public.settings           enable row level security;
alter table public.reminder_state     enable row level security;
alter table public.push_subscriptions enable row level security;

create policy own on public.schedules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.checkins  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.skin_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.settings  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_read on public.reminder_state for select to authenticated
  using (user_id = (select auth.uid()));
-- reminder_state is written only by the edge functions (service role bypasses RLS)

create index on public.schedules (user_id);
create index on public.checkins (user_id, date desc);
create index on public.push_subscriptions (user_id);
