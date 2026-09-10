// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { allocateReference, NoCounterError } from '..'

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
