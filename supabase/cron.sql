-- One-time setup after the migration (SQL editor). Replace <ref> and the VAPID keys
-- (from `npm run gen-vapid`). Nothing secret is stored in this file.

-- 1) config the edge function reads (service role only)
create or replace function public.skiinx_config() returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets where name like 'skiinx\_%'
$$;
revoke all on function public.skiinx_config() from public, anon, authenticated;
grant execute on function public.skiinx_config() to service_role;

-- 2) secrets in Vault (the cron secret is generated inside the database)
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'skiinx_cron_secret');
select vault.create_secret('https://<ref>.supabase.co', 'skiinx_supabase_url_public');
select vault.create_secret('https://<your-app>.vercel.app', 'skiinx_app_url');
select vault.create_secret('<VAPID public key>', 'skiinx_vapid_public_key');
select vault.create_secret('<VAPID private key>', 'skiinx_vapid_private_key');

-- 3) every 5 minutes → edge function `skiinx` route /remind (Discord + phone notifications)
select cron.schedule('skiinx-remind', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'skiinx_supabase_url_public') || '/functions/v1/skiinx/remind',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'skiinx_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);

-- drop reminder_state older than 30 days, daily at 04:00 Bangkok (21:00 UTC)
select cron.schedule('skiinx-cleanup', '0 21 * * *',
  $$ delete from public.reminder_state where date < current_date - 30 $$);

-- check:   select * from cron.job;   select * from cron.job_run_details order by start_time desc limit 10;
-- stop:    select cron.unschedule('skiinx-remind');
