# Production operations and recovery

This portal holds financial evidence and identity data. A successful deployment is not a
backup, an audit log is not a backup, and a database backup does not include Supabase Storage
objects. Production needs all three layers below.

## Recommended launch baseline

- Keep Vercel for the application and Supabase for Postgres, Auth, and private object storage.
  Moving to AWS only to chase a temporary free allowance adds IAM, networking, patching,
  monitoring, mail, and restore work without improving the portal itself.
- Use Supabase Pro at minimum for a live club. It provides seven days of daily database
  backups. The Free plan has no automatic database backups and may pause inactive projects,
  so it is suitable for demos, not the only copy of live treasury records.
- Start with a **24-hour recovery point objective (RPO)** and a **four-hour recovery time
  objective (RTO)**. If losing a day's entries is unacceptable, add nightly encrypted logical
  exports or pay for point-in-time recovery (PITR).
- Keep an independent, encrypted copy of private Storage objects. Supabase database backups
  contain Storage metadata, not the uploaded proofs, logos, signatures, or generated documents.
- Run a restore drill into a separate project before launch and every quarter. A backup that
  has never been restored is only an assumption.

Current provider details: [Supabase database backups](https://supabase.com/docs/guides/platform/backups),
[Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), and
[restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

## Three recovery levels

1. **Ordinary correction — use the portal.** Void the specific register entry or document with
   a reason. Restore only the same targeted item, also with a reason. Never edit history or
   delete the evidence.
2. **Accidental bulk change — restore beside production.** Restore the nearest backup into a
   new project, inspect it, identify the exact missing/corrupted rows and objects, and copy only
   those back after a second person reviews the plan. This preserves legitimate work done after
   the accident.
3. **Database-wide disaster — controlled full restore.** Declare a maintenance window, stop
   writes, record the restore point, restore through the provider, rotate affected secrets,
   validate the checks below, and only then reopen the portal.

There should not be a “revert portal to snapshot” button in the application. It would give one
compromised exco session the power to erase everybody else's later work and cannot restore
private Storage objects consistently with the database.

## Restore validation checklist

- Users can sign in and role checks still separate MEMBER from EXCO.
- Audit rows exist before and after the incident window and remain append-only.
- Reference counters and issued references have no duplicates or reused void numbers.
- Register totals reconcile to the source spreadsheet and bank statement.
- Fee declarations, proofs, invoices, attendance sheets, and signatures resolve from private
  storage only for authorised users.
- Security-alert email and the optional Telegram alert both deliver a test event.
- `npm run db:verify-rls`, integration tests, and the read-only browser smoke test pass against
  the restored environment before DNS or production environment variables point to it.

## Audit and logging policy

- The database audit log is the authoritative business record: actor, action, target, before,
  after, and timestamp. It is append-only, written inside the same transaction as the change,
  and the database derives the actor from the authenticated connection.
- Runtime logs are operational evidence, not a copy of form submissions. They use structured
  JSON and must not contain payment proofs, bank details, student IDs, tokens, cookies, email
  bodies, or full request payloads.
- Retain production runtime/error logs outside the deployment for at least 30 days when budget
  permits. Restrict them to the named portal operators.
- Review the portal audit log weekly during active collections and immediately after any
  security alert.

## Security alert setup

Set `SECURITY_ALERT_EMAILS` to the treasurer, president, and technical owner; set
`SECURITY_ALERT_FROM` to a verified sender; and store a Resend **sending-only**, domain-restricted
key as `RESEND_API_KEY`. Alerts use provider idempotency keys, omit amounts and account/student
numbers, mask email/IP details, and never make the user's transaction fail if delivery is down.

The following are email-worthy: exco/access changes, bank details or signature changes,
financial settings changes, financial voids/restores, repeated authentication throttling, and
unhandled server errors. Routine successful sign-ins remain in the audit log/Telegram channel
without generating email noise.

## Ownership

Before launch, write down the names of:

- the person allowed to request a restore;
- the second person who must approve a production restore;
- the person holding database, Vercel, Resend, DNS, and encryption-key access;
- the fallback person who can act during exams, travel, or handover.

Keep recovery credentials and `FIELD_ENCRYPTION_KEYS` in the club password manager. Losing the
encryption key makes the encrypted coach banking data unreadable even when the database backup
itself restores correctly.
