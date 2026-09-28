-- D-018: no daily Repost cap (max 8 daily times instead); default interval 2 h.
ALTER TABLE "workspace" DROP COLUMN "dailyRepostCap";
ALTER TABLE "workspace" ALTER COLUMN "perPostMinIntervalMinutes" SET DEFAULT 120;
