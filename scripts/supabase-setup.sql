-- One-time (idempotent) Supabase production setup. Run via `pnpm prod:setup` after
-- `pnpm prod:migrate`. Variables: app_url, cron_secret (passed by scripts/prod.mts).
\set ON_ERROR_STOP on

-- 1. Keep app data out of Supabase's public Data API (defense in depth; RLS is on
--    every app table via migrations, and the Data API should be disabled too).
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 2. Scheduler: pg_cron triggers the app's job endpoint through pg_net.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. The endpoint's bearer secret lives encrypted in Supabase Vault, not in the job text.
SELECT vault.update_secret(id, :'cron_secret')
FROM vault.secrets WHERE name = 'x_manager_cron_secret';
SELECT vault.create_secret(:'cron_secret', 'x_manager_cron_secret', 'Bearer secret for /api/jobs/run')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'x_manager_cron_secret');

-- 4. Every 5 minutes: POST /api/jobs/run (precision ≈ ±5 min, see D-005).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'x-manager-reposts';
SELECT cron.schedule(
  'x-manager-reposts',
  '*/5 * * * *',
  format(
    $job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'x_manager_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    $job$,
    :'app_url' || '/api/jobs/run'
  )
);

SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'x-manager-reposts';
