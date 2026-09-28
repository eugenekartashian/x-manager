-- Supabase exposes the public schema through its Data API (PostgREST) with a public
-- anon key. Enabling RLS without policies denies all access through that API.
-- The app connects as the table owner, which bypasses RLS, so app behavior is unchanged.
-- Every new table must enable RLS too (enforced by tests/integration/rls.test.ts).
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "x_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "own_post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "repost_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "repost_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scheduled_repost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "repost_attempt" ENABLE ROW LEVEL SECURITY;
