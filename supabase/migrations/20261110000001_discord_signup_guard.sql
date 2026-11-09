-- Let "Sign in with Discord" create the account directly, while every other sign-up in this
-- (shared) Supabase project stays blocked. Wire it up in the dashboard:
--   Authentication → Hooks → "Before User Created" → Postgres → public.skiinx_before_user_created
-- then turn on "Allow new users to sign up". Order matters: hook first.

-- Discord accounts allowed to create a user. The first Discord account to sign up claims the app.
create table if not exists public.skiinx_allowed_discord (
  discord_id text primary key,
  claimed_at timestamptz not null default now()
);
alter table public.skiinx_allowed_discord enable row level security;
-- no policies on purpose: only the hook below (and the service role) ever touches this table

create or replace function public.skiinx_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u jsonb := event -> 'user';
  provider text := coalesce(u -> 'app_metadata' ->> 'provider', '');
  did text := coalesce(
    u -> 'user_metadata' ->> 'provider_id',
    u -> 'user_metadata' ->> 'sub',
    u -> 'identities' -> 0 ->> 'provider_id',
    ''
  );
begin
  -- everything that isn't Discord keeps the old behaviour: sign-ups are closed
  if provider <> 'discord' or did = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Signups not allowed for this instance'));
  end if;

  if exists (select 1 from public.skiinx_allowed_discord where discord_id = did) then
    return '{}'::jsonb;
  end if;

  -- nobody has claimed the app yet → this Discord account becomes the owner
  if not exists (select 1 from public.skiinx_allowed_discord) then
    insert into public.skiinx_allowed_discord (discord_id) values (did);
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This Discord account is not allowed to use Skiinx'));
end;
$$;

revoke execute on function public.skiinx_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.skiinx_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
