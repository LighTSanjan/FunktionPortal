-- Row-level security, the app_user role, and the audit-write function.
--
-- The kernel this app forked from carried all three; none of them survived the
-- schema rewrite, so src/core/db/client.ts has been raising RlsScopeError
-- against every database since. That is the correct failure — it refuses to
-- run rather than quietly querying as the table owner with RLS inert — but it
-- also means no feature code could use dbAs(), which is the only client
-- modules are allowed to import. This migration is what unblocks that.
--
-- The shape, which scripts/ci/verify-grants.sql asserts behaviourally:
--
--   app_user       the role the application connects as. Holds direct table
--                  grants, and inherits `authenticated` so the policies below
--                  (declared TO authenticated) apply to it.
--   authenticated  every signed-in user's role for raw PostgREST calls. Gets
--                  a deliberately smaller set of grants than app_user, so a
--                  leaked publishable key cannot reach money or evidence.
--
-- RLS is defence in depth here, not the primary control: authorisation is
-- enforced server-side in requirePermission() before any query runs. This is
-- what stands up if that is ever bypassed.

-- ─────────────────────────────────────────────────────────────────────────
-- Prerequisite
-- ─────────────────────────────────────────────────────────────────────────
--
-- Creating `app_user` and granting it `authenticated` both need privileges
-- the migration role does not have: it owns every table here but has no
-- CREATEROLE and is not a member of `authenticated`. Those two statements live
-- in scripts/db/create-app-user.sql, to be run once as `postgres` in the
-- Supabase SQL editor.
--
-- Stop rather than half-apply. A migration that created the policies but not
-- the role would leave a database where dbAs() cannot connect and every
-- signed-in page is broken, with the migration recorded as applied.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE EXCEPTION
      'Role app_user does not exist. Run scripts/db/create-app-user.sql as postgres first (see README, Deployment).';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Claim helpers
-- ─────────────────────────────────────────────────────────────────────────

-- The signed-in user id, read from the claims dbAs() installs on the
-- connection. Returns NULL rather than raising when unset, so a policy on an
-- unauthenticated connection denies rather than errors.
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )
$$;

-- SECURITY DEFINER, and it has to be: organisation_memberships carries its own
-- policy, and a policy that queried the table it is defined on through the
-- caller's own privileges would recurse. Definer rights break that cycle.
--
-- search_path is pinned. A SECURITY DEFINER function without one is the
-- classic privilege-escalation shape — a caller who can create a table in a
-- schema earlier on the path gets to choose what this function reads.
CREATE OR REPLACE FUNCTION public.app_is_member(target_org text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_memberships m
    WHERE m.org_id = target_org
      AND m.user_id = public.app_user_id()
      AND m.is_active
  )
$$;

-- Office is a label and never gates access (it routes notifications and prints
-- under signatures), so the only distinction RLS draws is the role: exco reach
-- everything in their organisation, members reach their own record.
CREATE OR REPLACE FUNCTION public.app_is_exco(target_org text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_memberships m
    WHERE m.org_id = target_org
      AND m.user_id = public.app_user_id()
      AND m.is_active
      AND m.role = 'EXCO'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.app_user_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_is_member(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_is_exco(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_user_id() TO app_user, authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_member(text) TO app_user, authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_exco(text) TO app_user, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- The audit write path
-- ─────────────────────────────────────────────────────────────────────────

-- Audit rows are append-only and unforgeable: the actor is read from the
-- connection's own claims rather than accepted as an argument, so a caller
-- cannot write a row attributing their action to somebody else.
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_org_id      text,
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_before      jsonb,
  p_after       jsonb,
  p_metadata    jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := public.app_user_id();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'write_audit_log: no authenticated actor on this connection';
  END IF;

  IF NOT public.app_is_member(p_org_id) THEN
    RAISE EXCEPTION 'write_audit_log: actor is not a member of %', p_org_id;
  END IF;

  INSERT INTO audit_logs (id, org_id, actor_id, action, target_type, target_id, before, after, metadata, created_at)
  VALUES (gen_random_uuid()::text, p_org_id, v_actor, p_action, p_target_type, p_target_id, p_before, p_after, p_metadata, now());
END
$$;

REVOKE EXECUTE ON FUNCTION public.write_audit_log(text,text,text,text,jsonb,jsonb,jsonb) FROM PUBLIC;
-- app_user only. A raw PostgREST caller forging audit entries would make the
-- log worse than useless, because it would still look authoritative.
GRANT EXECUTE ON FUNCTION public.write_audit_log(text,text,text,text,jsonb,jsonb,jsonb) TO app_user;

-- ─────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────────────────

-- A note on what is deliberately absent: FORCE ROW LEVEL SECURITY.
--
-- FORCE makes a table's policies apply to its owner too. The owner here is the
-- migration role, which is also what dbAdmin connects as — and dbAdmin's whole
-- job is the reads that happen before an org context exists: resolving a
-- session, provisioning a user, finding which organisations someone belongs
-- to. Under FORCE those run with no claims installed, match no policy, and
-- return nothing, so every sign-in breaks.
--
-- The boundary that keeps this honest is not FORCE, it is the ESLint rule
-- confining dbAdmin to src/core/**. Feature code cannot import it; everything
-- in src/modules/** goes through dbAs() as app_user, which is not the owner
-- and is therefore fully subject to what follows.
DO $$
DECLARE
  t text;
  -- Every application table. _prisma_migrations is deliberately absent: it is
  -- the migration runner's own bookkeeping and app_user has no business in it.
  org_scoped text[] := ARRAY[
    'attendance_imports','attendance_sheets','class_sessions','fund_accounts',
    'income_deposits','instructor_rates','instructors','invitations','invoices',
    'organisation_modules','organisation_settings','purchase_requests',
    'reference_counters','reference_numbers','register_entries','register_syncs',
    'terms'
  ];
BEGIN
  -- The straightforward majority: one org_id column, visible to any active
  -- member of that organisation. Exco-only reads among these are enforced in
  -- the application by requirePermission(); RLS here is the tenant boundary.
  FOREACH t IN ARRAY org_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.app_is_member(org_id)) WITH CHECK (public.app_is_member(org_id))',
      t || '_member_scope', t
    );
  END LOOP;
END
$$;

-- Organisations: reachable by their own members, by the id rather than an
-- org_id column.
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organisations_member_scope ON organisations
  FOR ALL TO authenticated
  USING (public.app_is_member(id))
  WITH CHECK (public.app_is_member(id));

-- Memberships: you can see the roster of an organisation you belong to.
-- app_is_member is SECURITY DEFINER precisely so this does not recurse.
ALTER TABLE organisation_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_member_scope ON organisation_memberships
  FOR ALL TO authenticated
  USING (public.app_is_member(org_id))
  WITH CHECK (public.app_is_exco(org_id));

-- Users: yourself, plus anyone you share an organisation with — the roster
-- screens and every "verified by" name need the second half.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_or_shared_org ON users
  FOR ALL TO authenticated
  USING (
    id = public.app_user_id()
    OR EXISTS (
      SELECT 1
      FROM organisation_memberships mine
      JOIN organisation_memberships theirs ON theirs.org_id = mine.org_id
      WHERE mine.user_id = public.app_user_id()
        AND mine.is_active
        AND theirs.user_id = users.id
    )
  )
  WITH CHECK (id = public.app_user_id());

-- Members: the roster. Exco see all of it; a member sees their own row.
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_scope ON members
  FOR ALL TO authenticated
  USING (
    public.app_is_exco(org_id)
    OR (public.app_is_member(org_id) AND user_id = public.app_user_id())
  )
  WITH CHECK (public.app_is_exco(org_id));

-- Attendance: a member may read their own marks and nobody else's. Only exco
-- write them — a member marking their own attendance is the whole problem.
ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_attendance_scope ON session_attendance
  FOR ALL TO authenticated
  USING (
    public.app_is_exco(org_id)
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = session_attendance.member_id
        AND m.user_id = public.app_user_id()
    )
  )
  WITH CHECK (public.app_is_exco(org_id));

-- Fee payments: the control the whole collection turns on. A member may read
-- their own row and declare against it; only exco may confirm one. The
-- confirmed/rejected transition is guarded in the application, because a
-- policy cannot express "these columns, by a different person".
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fee_payments_scope ON fee_payments
  FOR ALL TO authenticated
  USING (
    public.app_is_exco(org_id)
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = fee_payments.member_id
        AND m.user_id = public.app_user_id()
    )
  )
  WITH CHECK (
    public.app_is_exco(org_id)
    OR EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = fee_payments.member_id
        AND m.user_id = public.app_user_id()
    )
  );

-- Children of an org-scoped parent, reached through it.
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_lines_via_invoice ON invoice_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND public.app_is_member(i.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND public.app_is_member(i.org_id)));

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotations_via_request ON quotations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM purchase_requests p WHERE p.id = quotations.purchase_request_id AND public.app_is_member(p.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM purchase_requests p WHERE p.id = quotations.purchase_request_id AND public.app_is_member(p.org_id)));

-- Per-user rows: yours and only yours, in an org you belong to.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_own ON notifications
  FOR ALL TO authenticated
  USING (user_id = public.app_user_id())
  WITH CHECK (user_id = public.app_user_id());

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_layouts_own ON dashboard_layouts
  FOR ALL TO authenticated
  USING (user_id = public.app_user_id())
  WITH CHECK (user_id = public.app_user_id());

ALTER TABLE org_setup_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_setup_progress_own ON org_setup_progress
  FOR ALL TO authenticated
  USING (user_id = public.app_user_id())
  WITH CHECK (user_id = public.app_user_id());

-- Audit log: readable by exco, and never writable through a policy. Inserts
-- go through write_audit_log(), which stamps the actor itself.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT TO authenticated
  USING (public.app_is_exco(org_id));

-- ─────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────
--
-- Two different sets, and the difference is the point. app_user is the app's
-- own trusted connection and gets what the app needs. `authenticated` is what
-- a raw PostgREST call with the publishable key resolves to, and gets far
-- less — so a leaked anon key reaches the roster, not the money.
--
-- RLS applies to both, because neither owns the tables: app_user inherits
-- `authenticated` and matches the policies above, and a PostgREST caller is
-- `authenticated` directly. The migration role, which does own them, bypasses
-- RLS — that is what dbAdmin relies on, and why it is confined to src/core/**.

-- Start from nothing, so a stray default grant cannot survive underneath.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user, authenticated, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_user, authenticated, anon;

-- app_user: full DML on the application's own tables. Note the explicit
-- column list of privileges rather than ALL — ALL includes TRUNCATE, which
-- RLS does not constrain, so a leaked APP_USER_DATABASE_URL or a raw-SQL bug
-- could empty the register in one statement.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END
$$;

-- audit_logs is the exception: append-only, and not even app_user inserts
-- directly. write_audit_log() is SECURITY DEFINER and runs as the owner, so
-- revoking the direct write here does not break it — it removes the path that
-- would let the app write a row with an actor of its choosing.
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM app_user;

-- Reference counters are updated only through allocateReference()'s atomic
-- UPDATE ... RETURNING. Deleting a counter would lose the club's place in a
-- series, which is unrecoverable from inside the app.
REVOKE DELETE ON reference_counters FROM app_user;
-- An issued number is never deleted; a void is an update carrying a reason,
-- so that a gap in a series has an answer when OSL asks.
REVOKE DELETE ON reference_numbers FROM app_user;

-- `authenticated`: deliberately narrow. Everything the portal actually does
-- goes through the server, as app_user; this is what remains reachable if the
-- publishable key leaks. Read-only, and nothing carrying money or evidence.
GRANT SELECT ON organisations, organisation_memberships, users, members, terms TO authenticated;

-- Explicitly NOT granted to `authenticated`, and asserted in
-- scripts/ci/verify-grants.sql so a later blanket GRANT cannot quietly undo it:
--
--   invoices, invoice_lines      an invoice inserted outside the app is an
--                                invoice with no reference number allocated
--   reference_counters           a sequence handed out twice puts two
--                                documents into the Office of Finance under
--                                one number
--   fee_payments                 payment evidence carries the payer's name
--                                and often a partial account number
--   instructors, instructor_rates bank account numbers and signature keys
--   audit_logs                   read through the app, which checks the
--                                office, or not at all

-- anon reaches nothing. There is no public surface on this database.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- The migration runner's own bookkeeping. app_user must not see it: it is the
-- one table whose contents say what the schema is allowed to be.
REVOKE ALL ON _prisma_migrations FROM app_user, authenticated, anon;

-- Nothing above should be undone by a future `prisma migrate` creating tables
-- with different defaults, so pin what new tables inherit.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
