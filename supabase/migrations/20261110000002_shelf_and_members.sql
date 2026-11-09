-- Shelf (products + photos), and friends via invite codes.

/* ───────── membership ───────── */
create table if not exists public.skiinx_members (
  user_id    uuid primary key references auth.users on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  invited_by uuid references auth.users on delete set null,
  joined_at  timestamptz not null default now()
);
alter table public.skiinx_members enable row level security;
create policy own_read on public.skiinx_members for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.skiinx_invites (
  code       text primary key,
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by    uuid references auth.users on delete set null,
  used_at    timestamptz
);
alter table public.skiinx_invites enable row level security;
create policy own_read on public.skiinx_invites for select to authenticated using (created_by = (select auth.uid()));

create or replace function public.skiinx_is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.skiinx_members where user_id = auth.uid())
$$;

/** Current user's role; the very first person to ask (nobody is a member yet) becomes the owner. */
create or replace function public.skiinx_membership() returns text
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  if auth.uid() is null then return null; end if;
  select role into r from public.skiinx_members where user_id = auth.uid();
  if r is not null then return r; end if;
  if not exists (select 1 from public.skiinx_members) then
    insert into public.skiinx_members (user_id, role) values (auth.uid(), 'owner');
    return 'owner';
  end if;
  return null;
end $$;

create or replace function public.skiinx_create_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if not public.skiinx_is_member() then raise exception 'not a member'; end if;
  -- 8 chars, no look-alikes (0/O, 1/I/L)
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
    into c from generate_series(1, 8);
  insert into public.skiinx_invites (code, created_by) values (c, auth.uid());
  return c;
end $$;

create or replace function public.skiinx_redeem_invite(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare inv public.skiinx_invites;
begin
  if auth.uid() is null then return 'signin'; end if;
  if exists (select 1 from public.skiinx_members where user_id = auth.uid()) then return 'ok'; end if;
  select * into inv from public.skiinx_invites where code = upper(trim(p_code)) for update;
  if inv.code is null then return 'invalid'; end if;
  if inv.used_by is not null then return 'used'; end if;
  if inv.expires_at < now() then return 'expired'; end if;
  update public.skiinx_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  insert into public.skiinx_members (user_id, role, invited_by) values (auth.uid(), 'member', inv.created_by);
  return 'ok';
end $$;

create or replace function public.skiinx_member_count() returns int
language sql stable security definer set search_path = '' as $$
  select case when public.skiinx_is_member() then (select count(*)::int from public.skiinx_members) else 0 end
$$;

revoke execute on function public.skiinx_is_member(), public.skiinx_membership(), public.skiinx_create_invite(),
  public.skiinx_redeem_invite(text), public.skiinx_member_count() from public, anon;
grant execute on function public.skiinx_is_member(), public.skiinx_membership(), public.skiinx_create_invite(),
  public.skiinx_redeem_invite(text), public.skiinx_member_count() to authenticated;

-- existing Skiinx users keep access (first one becomes the owner)
insert into public.skiinx_members (user_id, role)
select s.user_id, case when row_number() over (order by s.updated_at) = 1 then 'owner' else 'member' end
from public.settings s
on conflict do nothing;

/* ───────── only members can use Skiinx data ───────── */
do $$
declare t text;
begin
  foreach t in array array['schedules','checkins','skin_logs','settings','push_subscriptions'] loop
    execute format('drop policy if exists own on public.%I', t);
    execute format('create policy own on public.%I for all to authenticated using (user_id = (select auth.uid()) and (select public.skiinx_is_member())) with check (user_id = (select auth.uid()) and (select public.skiinx_is_member()))', t);
  end loop;
end $$;

/* ───────── shelf ───────── */
create table if not exists public.skiinx_products (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  brand       text,
  category    text not null default 'other',
  actives     text[] not null default '{}',
  ingredients text,
  howto       text,
  image_url   text,
  icon        text,
  color       text,
  source      text not null default 'manual' check (source in ('manual','obf')),
  off_code    text,
  created_at  timestamptz not null default now()
);
alter table public.skiinx_products enable row level security;
create policy own on public.skiinx_products for all to authenticated
  using (user_id = (select auth.uid()) and (select public.skiinx_is_member()))
  with check (user_id = (select auth.uid()) and (select public.skiinx_is_member()));
create index if not exists skiinx_products_user_idx on public.skiinx_products (user_id);

-- product photos: public-read bucket (bottle photos, not faces), each user writes only their folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "skiinx product images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.skiinx_is_member()));
create policy "skiinx product images update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "skiinx product images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

/* ───────── sign-up: any Discord account may create a login; Skiinx access needs an invite ───────── */
create or replace function public.skiinx_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '') <> 'discord' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Signups not allowed for this instance'));
  end if;
  return '{}'::jsonb;
end $$;
