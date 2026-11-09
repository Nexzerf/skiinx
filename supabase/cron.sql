-- Run ONCE in the SQL editor, AFTER creating the two Vault secrets (see README):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');
-- (Kept out of migrations so no secret ever lands in a file.)

-- every 5 minutes → edge function `remind` (Discord + phone notifications)
select cron.schedule('skincare-remind', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/remind',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);

-- drop reminder_state older than 30 days, daily at 04:00 Bangkok (21:00 UTC)
select cron.schedule('skincare-cleanup', '0 21 * * *',
  $$ delete from public.reminder_state where date < current_date - 30 $$);

-- check:   select * from cron.job;   select * from cron.job_run_details order by start_time desc limit 10;
-- stop:    select cron.unschedule('skincare-remind');
