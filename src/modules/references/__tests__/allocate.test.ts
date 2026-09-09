// @vitest-environment node
/**
 * The allocator's logic, against a stub transaction client.
 *
 * This does not prove the concurrency guarantee — only a real Postgres can do
 * that, and there is a note below about the test that will. What it does
 * prove is everything around it: that the sequence returned by the UPDATE is
 * the one that gets formatted and recorded, that a missing counter is refused
 * rather than invented, and that the whole thing runs on the caller's
 * transaction so a failed document write takes the number down with it.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { allocateReference, NoCounterError } from '..'

/** Stands in for tx: records what was asked of it and replays a fixed answer. */
function stubTx(counterRows: Array<{ next_sequence: number }>) {
  const created: unknown[] = []
  const queries: string[] = []

  const tx = {
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push(strings.join('?'))
      void values
      return Promise.resolve(counterRows)
    }),
    referenceNumber: {
      create: vi.fn((args: unknown) => {
        created.push(args)
        return Promise.resolve({ id: 'ref_1' })
      }),
    },
  } as unknown as Prisma.TransactionClient

  return { tx, created, queries }
}

const ARGS = { orgId: 'org_1', series: 'IV' as const, financialYear: 2026, projectCode: '097' }

describe('allocating a number', () => {
  it('returns the sequence the counter handed back, formatted', async () => {
    const { tx } = stubTx([{ next_sequence: 10 }])
    const result = await allocateReference(tx, ARGS)

    expect(result.sequence).toBe(10)
    expect(result.formatted).toBe('IV26-097-0010')
    expect(result.id).toBe('ref_1')
  })

  it('records the number it issued, so a gap later has an answer', async () => {
    const { tx, created } = stubTx([{ next_sequence: 10 }])
    await allocateReference(tx, ARGS)

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      data: {
        orgId: 'org_1', series: 'IV', financialYear: 2026,
        sequence: 10, formatted: 'IV26-097-0010',
      },
    })
  })

  it('reads and increments in one statement, not a read then a write', async () => {
    // Two statements is how the same invoice number gets issued twice.
    const { tx, queries } = stubTx([{ next_sequence: 10 }])
    await allocateReference(tx, ARGS)

    expect(queries).toHaveLength(1)
    const sql = queries[0].replace(/\s+/g, ' ')
    expect(sql).toMatch(/UPDATE reference_counters/i)
    expect(sql).toMatch(/SET next_sequence = next_sequence \+ 1/i)
    expect(sql).toMatch(/RETURNING/i)
    expect(sql).not.toMatch(/SELECT .* FROM reference_counters/i)
  })

  it('refuses to invent a counter that has not been opened', async () => {
    // FY2026 opens at 0010 because 0001-0009 were issued before the portal
    // existed. Defaulting to 1 would reissue numbers already with Finance.
    const { tx, created } = stubTx([])

    await expect(allocateReference(tx, ARGS)).rejects.toThrow(NoCounterError)
    await expect(allocateReference(tx, ARGS)).rejects.toThrow(/not safe to assume 0001/)
    expect(created).toHaveLength(0)
  })

  it('does not record a number when the format is impossible', async () => {
    // Better to fail before writing than to leave a malformed number behind.
    const { tx, created } = stubTx([{ next_sequence: 10 }])
    await expect(allocateReference(tx, { ...ARGS, projectCode: '97' })).rejects.toThrow(/three digits/)
    expect(created).toHaveLength(0)
  })
})

/**
 * The guarantee the stub above cannot demonstrate.
 *
 * Gated on a real database: `npm run test:db`. Without one this is skipped
 * rather than quietly passing, because a concurrency test that never ran is
 * worse than no test at all — it reads like proof.
 */
const DB_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL
const describeDb = process.env.RUN_DB_TESTS && DB_URL ? describe : describe.skip

describeDb('concurrency, against a real Postgres', () => {
  it('never issues the same number twice under parallel allocation', async () => {
    const { PrismaClient } = await import('@prisma/client')
    const { PrismaPg } = await import('@prisma/adapter-pg')
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) })

    try {
      const org = await db.organisation.findFirstOrThrow({ where: { slug: 'funktion' } })
      const counter = await db.referenceCounter.findFirstOrThrow({
        where: { orgId: org.id, series: 'IV', financialYear: 2026 },
      })
      const start = counter.nextSequence

      // Twenty at once. A read-then-write implementation loses numbers here;
      // the atomic UPDATE ... RETURNING cannot.
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          db.$transaction(
            (tx) => allocateReference(tx, { orgId: org.id, series: 'IV', financialYear: 2026, projectCode: '097' }),
            // Twenty interactive transactions contend for the pool before
            // they contend for the counter row. The default 2s wait to even
            // start is what times out here, not the allocation itself.
            { maxWait: 20_000, timeout: 20_000 },
          ),
        ),
      )

      const sequences = results.map((r) => r.sequence).sort((a, b) => a - b)
      const expected = Array.from({ length: 20 }, (_, i) => start + i)

      expect(new Set(sequences).size).toBe(20)
      expect(sequences).toEqual(expected)
      expect(new Set(results.map((r) => r.formatted)).size).toBe(20)

      // Clean up: the numbers were real, so remove them and rewind rather
      // than leaving a twenty-wide hole in the club's live series.
      await db.referenceNumber.deleteMany({ where: { id: { in: results.map((r) => r.id) } } })
      await db.referenceCounter.update({ where: { id: counter.id }, data: { nextSequence: start } })
    } finally {
      await db.$disconnect()
    }
  }, 30_000)
})
