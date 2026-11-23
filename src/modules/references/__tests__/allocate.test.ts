// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { allocateReference, NoCounterError } from '..'

/**
 * `answers` are the rows each raw statement returns, in the order the
 * allocator issues them: lock the counter, look for a voided number that is
 * free, and only if there is none, advance the counter.
 */
function stubTx(answers: unknown[][]) {
  const created: unknown[] = []
  const queries: string[] = []
  let call = 0

  const tx = {
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      queries.push(strings.join('?').replace(/\s+/g, ' '))
      return Promise.resolve(answers[call++] ?? [])
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
  it('hands out the counter when nothing voided is waiting', async () => {
    const { tx } = stubTx([[{ next_sequence: 10 }], [], [{ next_sequence: 10 }]])
    const result = await allocateReference(tx, ARGS)

    expect(result.sequence).toBe(10)
    expect(result.formatted).toBe('IV26-097-0010')
    expect(result.id).toBe('ref_1')
  })

  it('records the number it issued', async () => {
    const { tx, created } = stubTx([[{ next_sequence: 10 }], [], [{ next_sequence: 10 }]])
    await allocateReference(tx, ARGS)

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      data: {
        orgId: 'org_1', series: 'IV', financialYear: 2026,
        sequence: 10, formatted: 'IV26-097-0010',
      },
    })
  })

  it('locks the counter before choosing, so two documents cannot get one number', async () => {
    const { tx, queries } = stubTx([[{ next_sequence: 10 }], [], [{ next_sequence: 10 }]])
    await allocateReference(tx, ARGS)

    expect(queries[0]).toMatch(/FROM reference_counters/i)
    expect(queries[0]).toMatch(/FOR UPDATE/i)
  })

  it('advances the counter in one statement that returns the number', async () => {
    const { tx, queries } = stubTx([[{ next_sequence: 10 }], [], [{ next_sequence: 10 }]])
    await allocateReference(tx, ARGS)

    const bump = queries[2]
    expect(bump).toMatch(/UPDATE reference_counters/i)
    expect(bump).toMatch(/SET next_sequence = next_sequence \+ 1/i)
    expect(bump).toMatch(/RETURNING/i)
  })

  it('issues the lowest voided number again, and leaves the counter alone', async () => {
    // 0017 and 0018 were voided and their months raised again: the series
    // has no gap only if the replacements are 0017 and 0018.
    const { tx, queries, created } = stubTx([[{ next_sequence: 21 }], [{ sequence: 17 }]])
    const result = await allocateReference(tx, ARGS)

    expect(result.sequence).toBe(17)
    expect(result.formatted).toBe('IV26-097-0017')
    expect(queries).toHaveLength(2)
    expect(queries.some((q) => /UPDATE reference_counters/i.test(q))).toBe(false)
    expect(created[0]).toMatchObject({ data: { sequence: 17, formatted: 'IV26-097-0017' } })
  })

  it('only offers a voided number that no live document holds, lowest first', async () => {
    const { tx, queries } = stubTx([[{ next_sequence: 21 }], [{ sequence: 17 }]])
    await allocateReference(tx, ARGS)

    const find = queries[1]
    expect(find).toMatch(/voided_at IS NOT NULL/i)
    expect(find).toMatch(/NOT EXISTS/i)
    expect(find).toMatch(/l\.voided_at IS NULL/i)
    expect(find).toMatch(/ORDER BY v\.sequence/i)
    expect(find).toMatch(/LIMIT 1/i)
  })

  it('refuses to invent a counter that has not been opened', async () => {
    // FY2026 opens at 0015 because 0001-0014 were issued before the portal
    // existed. Defaulting to 1 would reissue numbers already with Finance.
    const { tx, created } = stubTx([[]])

    await expect(allocateReference(tx, ARGS)).rejects.toThrow(NoCounterError)
    await expect(allocateReference(tx, ARGS)).rejects.toThrow(/not safe to assume 0001/)
    expect(created).toHaveLength(0)
  })

  it('does not record a number when the format is impossible', async () => {
    const { tx, created } = stubTx([[{ next_sequence: 10 }], [], [{ next_sequence: 10 }]])
    await expect(allocateReference(tx, { ...ARGS, projectCode: '97' })).rejects.toThrow(/three digits/)
    expect(created).toHaveLength(0)
  })
})
