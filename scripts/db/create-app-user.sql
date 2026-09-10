-- Run ONCE per environment, in the Supabase SQL editor, BEFORE `npm run db:deploy`.
--
-- Everything here needs privileges the migration role does not have. On this
-- project Prisma migrates as `funktion_migrate`, which owns every table but is
-- not a superuser: it has no CREATEROLE, and it is not a member of
-- `authenticated`, so it can neither create `app_user` nor grant it the
-- membership the RLS policies are written against. The Supabase SQL editor
-- runs as `postgres`, which can do both.
--
-- The RLS migration checks for the role and stops with a pointer back here if
-- it is missing, so running these out of order fails loudly rather than
-- half-applying.

-- 1. The role the application connects as at runtime.
--
--    Created NOLOGIN, with no password, on purpose. Setting a password here
--    would mean either a real secret committed to git or a placeholder that
--    silently becomes the live password when somebody runs the file without
--    reading it — which is exactly what happened the first time.
--
--    The password and the LOGIN attribute are granted together, by
--    scripts/db/set-app-user-password.sh, which generates the secret locally
--    and writes APP_USER_DATABASE_URL for you. Until that runs, this role
--    cannot connect at all, so an unedited run of this file is inert rather
--    than dangerous.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- 2. RLS policies are declared `TO authenticated`. app_user reaches them through
--    role membership, while holding its own direct table grants that
--    `authenticated` deliberately does not have — so a raw PostgREST call with
--    the publishable key and the app's own trusted connection are not
--    equivalent.
GRANT authenticated TO app_user;

-- 3. Schema access. The tables themselves are granted by the migration, which
--    runs as their owner.
GRANT USAGE ON SCHEMA public TO app_user;

-- 4. Let the migration role manage privileges for app_user on its own tables.
GRANT app_user TO funktion_migrate;

-- rolcanlogin is expected to be FALSE here. It becomes true when
-- set-app-user-password.sh's statement is run.
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'app_user';
