'use client'

import { useMemo, useState } from 'react'
import type { FeeTier } from '@prisma/client'
import { TIER_LABEL, type TermRates } from '@/modules/fees/tiers'
import { formatSgd } from '@/modules/coach-claim/money'
import type { FeeState } from '@/modules/fees/action-state'
import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { FeeEditor } from './fee-editor'
import { RecordForm, UndoPayment, UnlinkLogin } from './record-form'
import { DecideButtons } from './decide-buttons'
import { Notice, pillClass } from '../../_components/ui'

export type RowState = 'unpaid' | 'check' | 'paid' | 'refused' | 'waived'

/** One member's row, flattened for the browser. */
export interface FeeRowView {
  memberId: string
  paymentId: string | null
  name: string
  studentId: string | null
  tier: FeeTier
  amountCents: number
  state: RowState
  feeSource: 'payment' | 'exco' | 'roster'
  arrangement: { tier: FeeTier; amountCents: number | null; note: string | null } | null
  /** "Confirmed → Full term", from the roster label alone. */
  rosterReading: string
  uncertain: boolean
  because: string
  paidBy: string | null
  recorded: boolean
  outsideOsl: boolean
  reference: string | null
  hasProof: boolean
  /** "3 Sep", formatted on the server. */
  declaredOn: string | null
  rejectedReason: string | null
  hasAccount: boolean
  isYou: boolean
  declaredByYou: boolean
}

export type Filter = 'all' | 'unpaid' | 'check' | 'paid' | 'waived' | 'attention'

const FILTERS: { key: Filter; label: string; test: (row: FeeRowView) => boolean }[] = [
  { key: 'all', label: 'Everyone', test: () => true },
  { key: 'unpaid', label: 'Not paid', test: (row) => row.state === 'unpaid' || row.state === 'refused' },
  { key: 'check', label: 'To check', test: (row) => row.state === 'check' },
  { key: 'paid', label: 'Paid', test: (row) => row.state === 'paid' },
  { key: 'waived', label: 'Waived', test: (row) => row.state === 'waived' },
  {
    key: 'attention',
    label: 'Fee unclear',
    test: (row) => row.uncertain && row.feeSource === 'roster',
  },
]

type Open = { memberId: string; mode: 'fee' | 'record' | 'undo' | 'check' | 'unlink' } | null

/**
 * Everybody on the roster and where their fee stands, as one list.
 *
 * "Who still owes?" comes first: find somebody, change what they pay, record
 * that they paid. Tick several to set a fee for all of them at once.
 */
export function FeeTable({
  orgSlug,
  termId,
  closed,
  rates,
  rows,
  initialFilter = 'all',
}: {
  orgSlug: string
  termId: string
  closed: boolean
  rates: TermRates
  rows: FeeRowView[]
  initialFilter?: Filter
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Open>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.test).length])) as Record<Filter, number>,
    [rows]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const test = FILTERS.find((f) => f.key === filter)!.test
    return rows.filter(
      (row) =>
        test(row) &&
        (!needle || row.name.toLowerCase().includes(needle) || (row.studentId ?? '').includes(needle))
    )
  }, [rows, query, filter])

  // Ticks on rows that are no longer shown still count; say how many are hidden
  // rather than applying a fee to people the treasurer cannot see.
  const selectedIds = [...selected].filter((id) => rows.some((row) => row.memberId === id))
  const hiddenSelected = selectedIds.filter((id) => !visible.some((row) => row.memberId === id)).length
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.memberId))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current)
      for (const row of visible) {
        if (allVisibleSelected) next.delete(row.memberId)
        else next.add(row.memberId)
      }
      return next
    })
  }

  function done(result?: FeeState) {
    setOpen(null)
    setFlash(result?.message ?? null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a name or student ID"
          aria-label="Search members"
          className="lapis-field h-9 min-w-0 flex-1 basis-56 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-[13px] text-text"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={pillClass(filter === f.key)}
            >
              {f.label}
              <span className="tabular-nums text-text-subtle">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {flash && (
        <Notice tone="success" role="status">
          {flash}
        </Notice>
      )}

      {!closed && selectedIds.length > 0 && (
        <div className="sticky top-2 z-10 space-y-3 rounded-[var(--radius-md)] border border-brand-ink bg-paper px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium">
              {selectedIds.length} selected
              {hiddenSelected > 0 && (
                <span className="font-normal text-text-muted"> ({hiddenSelected} not shown by this filter)</span>
              )}
            </p>
            <div className="flex gap-2">
              {!bulkOpen && (
                <Button type="button" size="sm" onClick={() => setBulkOpen(true)}>
                  Set their fee
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected(new Set())
                  setBulkOpen(false)
                }}
              >
                Clear
              </Button>
            </div>
          </div>
          {bulkOpen && (
            <FeeEditor
              orgSlug={orgSlug}
              termId={termId}
              memberIds={selectedIds}
              rates={rates}
              current={null}
              hasArrangement={rows.some((row) => selected.has(row.memberId) && row.arrangement)}
              rosterReading="each person's roster status"
              onDone={(result) => {
                setBulkOpen(false)
                setSelected(new Set())
                setFlash(result.message ?? null)
              }}
              onCancel={() => setBulkOpen(false)}
            />
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-subtle sm:flex">
          {!closed && (
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAll}
              aria-label="Select everyone shown"
            />
          )}
          <span className="flex-1">Member</span>
          <span className="w-44">Fee</span>
          <span className="w-36">Status</span>
          <span className="w-40 text-right">&nbsp;</span>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-muted">
            {query ? `Nobody matches “${query}”.` : 'Nobody here.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const isOpen = open?.memberId === row.memberId
              return (
                <li key={row.memberId} className={isOpen ? 'bg-paper/60' : undefined}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    {!closed && (
                      <input
                        type="checkbox"
                        checked={selected.has(row.memberId)}
                        onChange={() => toggle(row.memberId)}
                        aria-label={`Select ${row.name}`}
                      />
                    )}

                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-[13.5px] font-medium">
                        {row.name}
                        {row.isYou && <span className="ml-1.5 text-[11.5px] font-normal text-text-subtle">you</span>}
                      </p>
                      <p className="text-[11.5px] tabular-nums text-text-subtle">
                        {row.studentId ?? 'No student ID'}
                        {!row.hasAccount && ' · no portal account'}
                        {row.hasAccount && !row.isYou && (
                          <>
                            {' · '}
                            <button
                              type="button"
                              onClick={() => setOpen(isOpen && open?.mode === 'unlink' ? null : { memberId: row.memberId, mode: 'unlink' })}
                              className="hover:text-accent-600"
                            >
                              unlink login
                            </button>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="w-full sm:w-44">
                      <button
                        type="button"
                        disabled={closed || row.state === 'paid'}
                        onClick={() => setOpen(isOpen && open?.mode === 'fee' ? null : { memberId: row.memberId, mode: 'fee' })}
                        title={row.state === 'paid' ? 'Already paid. Undo the payment to change the fee.' : 'Change what they pay'}
                        className="group text-left disabled:cursor-default"
                      >
                        <span className="block text-[13px] tabular-nums text-text">
                          {formatSgd(row.amountCents)}
                          <span className="text-text-muted"> · {TIER_LABEL[row.tier]}</span>
                          {row.uncertain && row.feeSource === 'roster' && (
                            <span className="ml-1 font-semibold text-warning" aria-label="The roster is not sure">
                              ?
                            </span>
                          )}
                        </span>
                        <span className="block text-[11.5px] text-text-subtle group-enabled:group-hover:text-accent-600">
                          {row.feeSource === 'exco'
                            ? row.arrangement?.note || 'Set by the exco'
                            : row.feeSource === 'roster'
                              ? row.uncertain
                                ? `Check: ${row.because}`
                                : 'From the roster'
                              : row.state === 'paid'
                                ? 'As paid'
                                : 'What they said they paid'}
                          {!closed && row.state !== 'paid' && <span className="text-accent-600"> · change</span>}
                        </span>
                      </button>
                    </div>

                    <div className="w-36">
                      <StatusBadge row={row} />
                    </div>

                    <div className="flex w-full justify-start sm:w-40 sm:justify-end">
                      {!closed && (
                        <RowAction
                          row={row}
                          open={open}
                          setOpen={setOpen}
                        />
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-dashed border-border px-4 py-3 sm:pl-11">
                      {open.mode === 'fee' && (
                        <FeeEditor
                          orgSlug={orgSlug}
                          termId={termId}
                          memberIds={[row.memberId]}
                          rates={rates}
                          current={{ tier: row.tier, amountCents: row.amountCents, note: row.arrangement?.note ?? null }}
                          hasArrangement={row.arrangement !== null}
                          rosterReading={row.rosterReading}
                          onDone={done}
                          onCancel={() => setOpen(null)}
                        />
                      )}
                      {open.mode === 'record' && (
                        <RecordForm
                          orgSlug={orgSlug}
                          termId={termId}
                          memberId={row.memberId}
                          name={row.name}
                          amount={formatSgd(row.amountCents)}
                          onDone={() => done()}
                          onCancel={() => setOpen(null)}
                        />
                      )}
                      {open.mode === 'check' && row.paymentId && (
                        <div id={`payment-${row.paymentId}`} className="flex flex-wrap items-start gap-4">
                          {row.hasProof && (
                            <a
                              href={`/${orgSlug}/fees/collection/${row.paymentId}/proof`}
                              target="_blank"
                              rel="noopener"
                              title="Open the screenshot full size"
                              className="block shrink-0"
                            >
                              {/* Streamed by a route that re-checks fee.manage on every request. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/${orgSlug}/fees/collection/${row.paymentId}/proof`}
                                alt={`${row.name}'s payment screenshot`}
                                className="max-h-[260px] w-auto max-w-[200px] rounded-[var(--radius-sm)] border border-border bg-white object-contain"
                              />
                            </a>
                          )}
                          <div className="min-w-[14rem] flex-1 space-y-3">
                            <p className="text-[13px] leading-relaxed text-text">
                              Should show <span className="font-semibold tabular-nums">{formatSgd(row.amountCents)}</span>
                              {row.reference && (
                                <>
                                  {' '}
                                  with reference <span className="font-mono">{row.reference}</span>
                                </>
                              )}
                              {row.declaredOn && <span className="text-text-muted"> · sent {row.declaredOn}</span>}
                              {row.uncertain && <span className="block text-warning">Fee to check: {row.because}</span>}
                            </p>
                            <DecideButtons
                              orgSlug={orgSlug}
                              paymentId={row.paymentId}
                              memberName={row.name}
                              ownDeclaration={row.declaredByYou || row.isYou}
                            />
                          </div>
                        </div>
                      )}
                      {open.mode === 'unlink' && (
                        <UnlinkLogin
                          orgSlug={orgSlug}
                          memberId={row.memberId}
                          name={row.name}
                          onDone={() => done()}
                          onCancel={() => setOpen(null)}
                        />
                      )}
                      {open.mode === 'undo' && row.paymentId && (
                        <UndoPayment
                          orgSlug={orgSlug}
                          paymentId={row.paymentId}
                          label={
                            row.recorded
                              ? `Remove ${row.name}'s payment? They go back to not paid.`
                              : `Send ${row.name}'s payment back to be checked again?`
                          }
                          onDone={() => done()}
                          onCancel={() => setOpen(null)}
                        />
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ row }: { row: FeeRowView }) {
  switch (row.state) {
    case 'paid':
      return (
        <div>
          <Badge variant="success">Paid</Badge>
          <p className="mt-0.5 truncate text-[11px] text-text-subtle" title={row.reference ?? undefined}>
            {row.outsideOsl ? 'outside OSL · ' : ''}
            {row.paidBy ? `by ${row.paidBy.split(/\s+/)[0]}` : ''}
          </p>
        </div>
      )
    case 'check':
      return <Badge variant="warning">Says they paid</Badge>
    case 'refused':
      return (
        <div>
          <Badge variant="danger">Couldn&rsquo;t match</Badge>
          {row.rejectedReason && (
            <p className="mt-0.5 truncate text-[11px] text-text-subtle" title={row.rejectedReason}>
              {row.rejectedReason}
            </p>
          )}
        </div>
      )
    case 'waived':
      return <Badge variant="neutral">Waived</Badge>
    default:
      return <Badge variant="neutral">Not paid</Badge>
  }
}

function RowAction({
  row,
  open,
  setOpen,
}: {
  row: FeeRowView
  open: Open
  setOpen: (open: Open) => void
}) {
  const toggle = (mode: 'record' | 'undo' | 'check') =>
    setOpen(open?.memberId === row.memberId && open.mode === mode ? null : { memberId: row.memberId, mode })

  if (row.state === 'waived') return null

  if (row.state === 'check') {
    return row.declaredByYou || row.isYou ? (
      <span className="text-[12px] text-text-subtle">Someone else checks yours</span>
    ) : (
      <Button type="button" size="sm" onClick={() => toggle('check')}>
        Check it
      </Button>
    )
  }

  if (row.state === 'paid') {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => toggle('undo')}>
        Undo
      </Button>
    )
  }

  if (row.isYou) {
    return <span className="text-[12px] text-text-subtle">Someone else records yours</span>
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={() => toggle('record')}>
      Record payment
    </Button>
  )
}
