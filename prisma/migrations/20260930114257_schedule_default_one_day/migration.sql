-- New default: a schedule starts as a one-day run (no longer "no end date").
-- Existing schedules that are off and never used keep up with it; used ones are left alone.
UPDATE "repost_schedule" SET "durationDays" = 1
WHERE "active" = false AND "consentedAt" IS NULL AND "durationDays" IS NULL;
