/** Append-only audit writes. */
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

/** Keep transaction-scoped audit writes atomic and derive their actor in Postgres. */
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
