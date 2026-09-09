/**
 * Audit service — append-only.
 * Exposes no update or delete path.
 */
import { Prisma } from '@prisma/client'
import { dbAdmin } from '@/core/db/admin'

export interface AuditEntry {
  orgId: string
  actorId: string
  action: string
  targetType: string
  targetId: string
  before?: unknown
  after?: unknown
  metadata?: unknown
}

/**
 * Write an audit log entry. This is append-only — no update or delete.
 * Passing the active transaction keeps the audit row atomic with its mutation.
 *
 * With a `tx` (the RLS-scoped `dbAs()` path), direct INSERT on audit_logs is
 * meant to be revoked from the app's DB role — the only way in being
 * write_audit_log(), which reads the actor from auth.uid() itself so it can't
 * be forged. Without a `tx` (the dbAdmin/service-role fallback), RLS doesn't
 * apply, so the plain insert is used directly.
 *
 * write_audit_log() is not in prisma/migrations/ yet; it lands with the same
 * hardening migration that creates app_user and the policies. Until then the
 * `tx` branch fails on the missing function rather than writing an
 * unattributable row, which is the right way round.
 */
export async function writeAudit(
  entry: AuditEntry,
  tx?: Prisma.TransactionClient
): Promise<void> {
  if (tx) {
    const toJsonbParam = (value: unknown): string | null =>
      value === undefined || value === null ? null : JSON.stringify(value)

    await tx.$executeRaw`
      SELECT public.write_audit_log(
        ${entry.orgId},
        ${entry.action},
        ${entry.targetType},
        ${entry.targetId},
        ${toJsonbParam(entry.before)}::jsonb,
        ${toJsonbParam(entry.after)}::jsonb,
        ${toJsonbParam(entry.metadata)}::jsonb
      )
    `
    return
  }

  await dbAdmin.auditLog.create({
    data: {
      orgId: entry.orgId,
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before as object | undefined,
      after: entry.after as object | undefined,
      metadata: entry.metadata as object | undefined,
    },
  })
}
