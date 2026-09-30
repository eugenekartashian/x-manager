-- AlterTable
ALTER TABLE "workspace" ALTER COLUMN "limitDailyTimes" SET DEFAULT 4,
ALTER COLUMN "limitListPosts" SET DEFAULT 2;

-- Existing users still on the old defaults (4 posts, 2 times) move to the new ones.
-- Limits the admin changed by hand are left alone.
UPDATE "workspace" SET "limitListPosts" = 2, "limitDailyTimes" = 4
WHERE "limitListPosts" = 4 AND "limitDailyTimes" = 2;
