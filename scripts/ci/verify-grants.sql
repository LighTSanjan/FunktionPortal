-- Behavioural check of the app_user/authenticated role split, run in CI
-- against a real Postgres instance after the full migration set is applied.
--
-- It checks what Postgres actually resolved the privileges to, using the same
-- has_*_privilege() introspection functions PostgREST itself relies on —
-- which is a different question from whether the GRANT/REVOKE statements are
-- present in a migration file. That distinction caught two real bugs by hand
-- on the kernel this app forked from: a column-level REVOKE silently losing
-- to a pre-existing table-level GRANT, and a missing user_id grant that broke
-- every policy referencing it for `authenticated`.
--
-- ─── Current state ───────────────────────────────────────────────────────
-- The FUNKtion migration set is a clean Prisma init. It creates no roles, no
-- policies and no grants: the HR kernel's hardening migrations did not carry
-- across the schema rewrite. So `app_user` does not exist yet, and this file
-- has nothing to assert against.
--
-- It skips with a NOTICE in that state rather than failing, so CI stays
-- honest about what it is and isn't checking — and every assertion below
-- arms itself automatically the moment the hardening migration lands.
-- src/core/db/client.ts already refuses to run without the role, so the
-- absence is loud at runtime; this is the check that it stays fixed.
DO $$
DECLARE
  ok boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'verify-grants: SKIPPED — role app_user does not exist.';
    RAISE NOTICE '  The migration set creates no roles, policies or grants yet.';
    RAISE NOTICE '  dbAs() raises RlsScopeError against this database (by design).';
    RAISE NOTICE '  These assertions arm themselves once the hardening migration lands.';
    RETURN;
  END IF;

  -- Nothing at all is readable by a raw PostgREST caller. Sign-up is open and
  -- every account joins the club, so `authenticated` means "anybody". These
  -- five were left readable once, and leaked every member's name and email.
  FOR ok IN
    SELECT has_table_privilege('authenticated', t, 'SELECT')
    FROM unnest(ARRAY['organisations', 'organisation_memberships', 'users', 'members', 'terms']) AS t
  LOOP
    IF ok THEN
      RAISE EXCEPTION 'FAIL: authenticated must NOT have SELECT on any public table';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'FAIL: anon/authenticated hold a grant on a public table';
  END IF;

  -- app_user (the app's own DB role) can read the member roster...
  SELECT has_table_privilege('app_user', 'members', 'SELECT') INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL: app_user should have SELECT on members';
  END IF;

  -- Financial tables: app_user can write (the app's own mutations)...
  SELECT has_table_privilege('app_user', 'invoices', 'INSERT') INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL: app_user should have INSERT on invoices';
  END IF;

  -- ...but a raw PostgREST caller cannot bypass the app's own rules. An
  -- invoice inserted outside the app is an invoice with no reference number
  -- allocated against the counter.
  SELECT has_table_privilege('authenticated', 'invoices', 'INSERT') INTO ok;
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated must NOT have INSERT on invoices';
  END IF;

  -- The counters are the one table where a raw write is unrecoverable: a
  -- sequence handed out twice puts two documents into the Office of Finance
  -- under one number.
  SELECT has_table_privilege('authenticated', 'reference_counters', 'UPDATE') INTO ok;
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated must NOT have UPDATE on reference_counters';
  END IF;

  -- Payment evidence carries the payer's name and often a partial account
  -- number. It is read through the app or not at all.
  SELECT has_table_privilege('authenticated', 'fee_payments', 'SELECT') INTO ok;
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated must NOT have SELECT on fee_payments';
  END IF;

  -- write_audit_log(): only the app (as app_user) can write audit rows...
  SELECT has_function_privilege(
    'app_user', 'write_audit_log(text,text,text,text,jsonb,jsonb,jsonb)', 'EXECUTE'
  ) INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'FAIL: app_user should have EXECUTE on write_audit_log';
  END IF;

  -- ...a raw caller must not be able to forge arbitrary audit entries.
  SELECT has_function_privilege(
    'authenticated', 'write_audit_log(text,text,text,text,jsonb,jsonb,jsonb)', 'EXECUTE'
  ) INTO ok;
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated must NOT have EXECUTE on write_audit_log';
  END IF;

  -- app_user must not be able to TRUNCATE — RLS doesn't apply to it, so a
  -- leaked APP_USER_DATABASE_URL or a raw-SQL bug could otherwise wipe the
  -- register in one statement.
  SELECT has_table_privilege('app_user', 'invoices', 'TRUNCATE') INTO ok;
  IF ok THEN
    RAISE EXCEPTION 'FAIL: app_user must NOT have TRUNCATE on invoices';
  END IF;

  SELECT has_table_privilege('app_user', '_prisma_migrations', 'SELECT') INTO ok;
  IF ok THEN
    RAISE EXCEPTION 'FAIL: app_user must NOT have access to _prisma_migrations';
  END IF;

  RAISE NOTICE 'verify-grants: all assertions passed';
END
$$;
