/**
 * Every exco download, opened by a member.
 *
 * The pages behind these links send a member to "no access". The downloads
 * themselves are route handlers, and used to let PermissionDeniedError escape:
 * a 500, logged as a crash, for a member who tapped an exco link somebody
 * shared in the group chat. Found by doing exactly that on the hosted demo.
 *
 * The permission check runs before anything is loaded, so placeholder ids are
 * enough: the refusal must come first, whatever the id points at.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET as monthPdf } from '@/app/(dashboard)/[orgSlug]/monthly-run/[invoiceId]/pdf/route'
import { GET as monthDocument } from '@/app/(dashboard)/[orgSlug]/monthly-run/[invoiceId]/download/[document]/route'
import { GET as paymentProof } from '@/app/(dashboard)/[orgSlug]/fees/collection/[paymentId]/proof/route'
import { GET as responseProof } from '@/app/(dashboard)/[orgSlug]/fees/collection/responses/[responseId]/proof/route'
import { GET as responsesCsv } from '@/app/(dashboard)/[orgSlug]/fees/collection/responses/export/route'
import { GET as depositForm } from '@/app/(dashboard)/[orgSlug]/fees/collection/deposit-form/route'
import { GET as termSummary } from '@/app/(dashboard)/[orgSlug]/fees/collection/summary/download/route'
import { as, createOrganisation, createUser, join, outcome, resetDatabase, type TestOrg, type TestUser } from './harness'

let org: TestOrg
let member: TestUser
let treasurer: TestUser

const request = (path = '/') => new Request(`http://test${path}?term=no-such-term`)

const downloads: Array<[string, () => Promise<Response>]> = [
  ['the signed month as a PDF', () =>
    monthPdf(request() as NextRequest, { params: Promise.resolve({ orgSlug: org.slug, invoiceId: 'no-such-invoice' }) })],
  ['a month’s invoice', () =>
    monthDocument(request(), {
      params: Promise.resolve({ orgSlug: org.slug, invoiceId: 'no-such-invoice', document: 'invoice.docx' }),
    })],
  ['a payment’s screenshot', () =>
    paymentProof(request(), { params: Promise.resolve({ orgSlug: org.slug, paymentId: 'no-such-payment' }) })],
  ['a form response’s screenshot', () =>
    responseProof(request(), { params: Promise.resolve({ orgSlug: org.slug, responseId: 'no-such-response' }) })],
  ['the form responses as a CSV', () => responsesCsv(request(), { params: Promise.resolve({ orgSlug: org.slug }) })],
  ['the deposit form', () => depositForm(request(), { params: Promise.resolve({ orgSlug: org.slug }) })],
  ['the term summary', () => termSummary(request(), { params: Promise.resolve({ orgSlug: org.slug }) })],
]

describe('exco downloads opened by a member', () => {
  beforeAll(async () => {
    await resetDatabase()
    org = await createOrganisation()
    member = await createUser('Mo Member')
    treasurer = await createUser('Tess Treasurer')
    await join(member, org, 'MEMBER')
    await join(treasurer, org, 'EXCO', 'TREASURER')
  })

  it.each(downloads)('refuses %s with a 403, not a crash', async (_name, download) => {
    as(member)
    const result = await outcome(download)
    expect(result.kind).toBe('returned')
    if (result.kind !== 'returned') return
    expect(result.value.status).toBe(403)
    expect(await result.value.text()).toBe('Only the exco can download this.')
  })

  it.each(downloads)('lets the treasurer past the check for %s', async (_name, download) => {
    as(treasurer)
    const result = await outcome(download)
    // Nothing exists behind the placeholder ids, so not-found in whatever form
    // the route gives it. What matters is that it is not the refusal.
    if (result.kind === 'returned') expect(result.value.status).not.toBe(403)
    else expect(result.kind).not.toBe('denied')
  })
})
