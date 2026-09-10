-- Access requests: a member asking for their access to be widened.
--
-- Written by hand rather than generated: the migration role has no permission
-- to create the shadow database `prisma migrate dev` needs. The table shape
-- matches prisma/schema/identity.prisma; the RLS and grants at the bottom are
-- what a generated migration would have left out, and without them the table
-- would be readable by nobody and writable by nobody.

CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "requested_role" "OrgRole" NOT NULL DEFAULT 'EXCO',
    "requested_office" "ExcoOffice",
    "reason" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "decision_note" TEXT,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_requests_org_id_status_idx" ON "access_requests"("org_id", "status");
CREATE INDEX "access_requests_user_id_idx" ON "access_requests"("user_id");

-- One open request per person. Without this the queue is a spam surface, and
-- a queue nobody wants to read is a queue where things get approved unread.
-- Partial, so the history of settled requests is kept intact.
CREATE UNIQUE INDEX "access_requests_one_open_per_user"
    ON "access_requests"("org_id", "user_id")
    WHERE "status" = 'PENDING';

-- The property the whole feature rests on, enforced by the database and not
-- only by the action that writes it: nobody approves their own request.
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_reviewer_is_not_requester"
    CHECK ("reviewed_by_user_id" IS NULL OR "reviewed_by_user_id" <> "user_id");

-- A settled request has to say who settled it and when; a pending one must
-- not pretend to have been settled.
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_decision_is_complete"
    CHECK (
      ("status" = 'PENDING' AND "reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL)
      OR ("status" = 'CANCELLED')
      OR ("status" IN ('APPROVED', 'REJECTED') AND "reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
    );

ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;

-- A member sees their own requests; exco see every request in their club.
CREATE POLICY access_requests_read ON "access_requests"
  FOR SELECT TO authenticated
  USING (
    public.app_is_exco(org_id)
    OR (public.app_is_member(org_id) AND user_id = public.app_user_id())
  );

-- You may only raise a request for yourself, in a club you belong to. Raising
-- one in somebody else's name would put their name on an escalation they never
-- asked for.
CREATE POLICY access_requests_insert ON "access_requests"
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member(org_id) AND user_id = public.app_user_id());

-- Exco decide; a requester may only withdraw their own. The reviewer-is-not-
-- requester CHECK above is what stops an exco member approving their own
-- request for a different office.
CREATE POLICY access_requests_update ON "access_requests"
  FOR UPDATE TO authenticated
  USING (
    public.app_is_exco(org_id)
    OR (user_id = public.app_user_id() AND status = 'PENDING')
  )
  WITH CHECK (
    public.app_is_exco(org_id)
    OR (user_id = public.app_user_id() AND status = 'CANCELLED')
  );

-- Deliberately no DELETE policy. A settled request is the record of who was
-- given access to the club's finances and when, which is exactly the question
-- a handover needs answered.

GRANT SELECT, INSERT, UPDATE ON "access_requests" TO app_user;
-- The hardening migration's ALTER DEFAULT PRIVILEGES hands app_user DELETE on
-- every new table automatically, so the grant above does not withhold it —
-- only RLS was standing in the way. Say it explicitly: a settled request is
-- the record of who was given access to the club's finances and when.
REVOKE DELETE ON "access_requests" FROM app_user;
