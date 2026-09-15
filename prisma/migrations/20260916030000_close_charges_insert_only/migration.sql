-- The previous migration granted only SELECT and INSERT, but the database's
-- default privileges hand new tables every privilege. Close charges are
-- written once and never changed; take the rest back explicitly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "term_close_charges" FROM app_user;
  END IF;
END
$$;
