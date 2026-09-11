-- Self-practice sessions: a class the club held with no coach.
--
-- The column was NOT NULL, which meant the portal could only record the weeks
-- somebody was paid for. The 2026 attendance import put a number on the cost:
-- five dates across two trimesters could not be imported at all, one of them
-- with twenty-five people present. A week with no coach is not a broken week.
ALTER TABLE "class_sessions"
  ALTER COLUMN "instructor_id" DROP NOT NULL;

-- The composite unique key stops constraining anything once the coach can be
-- null, because Postgres counts NULLs as distinct from one another: two rows
-- of (org, NULL, date) do not collide. This is the missing half of it.
CREATE UNIQUE INDEX "class_sessions_org_id_held_on_self_practice_key"
  ON "class_sessions" ("org_id", "held_on")
  WHERE "instructor_id" IS NULL;
