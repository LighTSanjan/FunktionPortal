-- The database, not the TypeScript, decides who can touch the club's money.
--
-- The policies here were written as app_is_member(org_id) for every command,
-- reading and writing alike, when a member of the organisation meant somebody
-- the club had admitted. Sign-up is open now and every account joins the club,
-- so "member" means "anybody with an email address" — and on these tables the
-- only thing between that account and the data was a requirePermission() call
-- in each server action. One forgotten call, in any future screen, would have
-- been a coach's bank account number or the address the month's documents are
-- emailed to.
--
-- Found by an integration test asserting that a member querying through the
-- app's own connection sees no invoices. They saw all of them, with their
-- lines, the coaches and the attendance sheets.
--
-- After this:
--   exco only, every command     money, documents, coaches, references, imports
--   member reads, exco writes    the club itself, its settings, terms, class dates
--   unchanged                    tables already scoped to the person (fee
--                                payments, roster rows, attendance, requests)

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance_imports', 'attendance_sheets', 'fund_accounts', 'income_deposits',
    'instructor_rates', 'instructors', 'invitations', 'invoices', 'organisation_modules',
    'purchase_requests', 'reference_counters', 'reference_numbers', 'register_entries',
    'register_syncs',
    'organisation_settings', 'terms', 'class_sessions'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON %I', p.policyname, t);
    END LOOP;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'attendance_imports', 'attendance_sheets', 'fund_accounts', 'income_deposits',
    'instructor_rates', 'instructors', 'invitations', 'invoices', 'organisation_modules',
    'purchase_requests', 'reference_counters', 'reference_numbers', 'register_entries',
    'register_syncs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.app_is_exco(org_id)) WITH CHECK (public.app_is_exco(org_id))',
      t || '_exco_only', t
    );
  END LOOP;

  -- Read by a member's own screens: the fee page reads the term, the class
  -- dates carry nothing private. Written only by the exco.
  FOREACH t IN ARRAY ARRAY['organisation_settings', 'terms', 'class_sessions'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (public.app_is_member(org_id))',
      t || '_member_read', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.app_is_exco(org_id)) WITH CHECK (public.app_is_exco(org_id))',
      t || '_exco_write', t
    );
  END LOOP;
END
$$;

-- Tables whose rows hang off a parent rather than carrying org_id.
DROP POLICY IF EXISTS invoice_lines_via_invoice ON invoice_lines;
CREATE POLICY invoice_lines_exco_only ON invoice_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND public.app_is_exco(i.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND public.app_is_exco(i.org_id)));

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quotations' LOOP
    EXECUTE format('DROP POLICY %I ON quotations', p.policyname);
  END LOOP;
END
$$;
CREATE POLICY quotations_exco_only ON quotations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM purchase_requests p WHERE p.id = quotations.purchase_request_id AND public.app_is_exco(p.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM purchase_requests p WHERE p.id = quotations.purchase_request_id AND public.app_is_exco(p.org_id)));

-- The organisation row: a member reads its name, only the exco rename it.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organisations' LOOP
    EXECUTE format('DROP POLICY %I ON organisations', p.policyname);
  END LOOP;
END
$$;
CREATE POLICY organisations_member_read ON organisations
  FOR SELECT TO authenticated USING (public.app_is_member(id));
CREATE POLICY organisations_exco_write ON organisations
  FOR ALL TO authenticated USING (public.app_is_exco(id)) WITH CHECK (public.app_is_exco(id));
