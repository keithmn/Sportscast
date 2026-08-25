-- Add the Domestic/Cup/Continental/International taxonomy to Competition.
-- Default LEAGUE is correct for the vast majority of existing rows; the 7
-- rows below are explicitly reclassified by slug (pre-checked to exist
-- before this migration was written).
ALTER TABLE "Competition" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'LEAGUE';

UPDATE "Competition" SET "category" = 'CONTINENTAL'
WHERE "slug" IN ('uefa-champions-league', 'euroleague-basketball');

UPDATE "Competition" SET "category" = 'INTERNATIONAL'
WHERE "slug" IN (
  'european-championship',
  'fifa-world-cup',
  'six-nations-championship',
  'world-championship-boxing',
  'pdc-darts'
);
