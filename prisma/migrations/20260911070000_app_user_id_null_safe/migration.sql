-- app_user_id() raises where it is documented to return NULL.
--
-- Its own comment says "Returns NULL rather than raising when unset, so a
-- policy on an unauthenticated connection denies rather than errors". That
-- holds only while the setting has never been touched: current_setting(...,
-- true) gives NULL then, and NULL::jsonb is NULL.
--
-- dbAs() installs the claims transaction-locally, so on a pooled connection
-- the GUC reverts to the empty string once that transaction commits — not to
-- unset. The next caller on that connection evaluates ''::jsonb, which raises
-- `invalid input syntax for type json`. Every RLS-relevant read happens inside
-- dbAs, which is why nothing has hit it; a trigger, a background job or an
-- admin write on the same pool would.
--
-- Found by a probe against this database, not by reading the code: the
-- function looked null-safe and the difference between "unset" and "set to
-- empty" is invisible at a glance.
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )
$$;
