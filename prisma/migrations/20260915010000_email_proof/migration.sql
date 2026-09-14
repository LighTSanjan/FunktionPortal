-- When, and how, this account last proved it holds its email address.
--
-- Supabase's own email_confirmed_at cannot answer that while "Confirm email"
-- is off: it is stamped the moment anybody signs up with a password, as any
-- address. This column is written only by the portal, and only in the
-- request that just verified an emailed code or completed a provider
-- sign-in whose email the provider vouched for.
ALTER TABLE "users" ADD COLUMN "email_proven_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "email_proven_via" TEXT;

-- Invitations are matched by address, whatever case it was typed in.
CREATE INDEX "invitations_lower_email_idx" ON "invitations" (lower("email"));

-- Sign-in attempts per key (an address, or an IP), per window. Written only
-- through the admin connection; nothing else may read or write it.
CREATE TABLE "auth_throttle" (
  "key"          TEXT         NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "count"        INTEGER      NOT NULL DEFAULT 0,
  CONSTRAINT "auth_throttle_pkey" PRIMARY KEY ("key", "window_start")
);
ALTER TABLE "auth_throttle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "auth_throttle" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "auth_throttle" FROM app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "auth_throttle" FROM anon, authenticated;
  END IF;
END
$$;
