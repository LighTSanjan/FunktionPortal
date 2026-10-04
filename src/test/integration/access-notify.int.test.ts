/**
 * Somebody asks for exco access, and the president and treasurer hear about
 * it by email rather than finding it whenever they next open the portal.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string[]; subject: string; text: string }> }))
const later = vi.hoisted(() => ({ tasks: [] as Array<Promise<unknown>> }))

vi.mock('@/core/mail', () => ({
  sendMail: async (message: { to: string[]; subject: string; text: string }) => {
    mail.sent.push(message)
    return true
  },
}))
// after() needs a request; here the work runs at once and is awaited below.
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (task: () => Promise<unknown>) => {
    later.tasks.push(task())
  },
}))

import { requestAccess } from '@/actions/access'
import {
  addRosterMember,
  as,
  createOrganisation,
  createUser,
  dbAdmin,
  form,
  join,
  ok,
  resetDatabase,
  type TestOrg,
  type TestUser,
} from './harness'

const blank = { error: null }
const reason = 'I was voted in as treasurer at the AGM last week.'

async function settled() {
  await Promise.all(later.tasks.splice(0))
}

describe('an exco access request', () => {
  let org: TestOrg
  let president: TestUser
  let treasurer: TestUser
  let secretary: TestUser
  let ben: TestUser

  beforeAll(async () => {
    await resetDatabase()
    org = await createOrganisation()
    president = await createUser('Priya President', 'priya@mymail.sutd.edu.sg')
    treasurer = await createUser('Tess Treasurer', 'tess@mymail.sutd.edu.sg')
    secretary = await createUser('Sam Secretary', 'sam@mymail.sutd.edu.sg')
    ben = await createUser('Ben Ong', 'ben@gmail.com')
    await join(president, org, 'EXCO', 'PRESIDENT')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(secretary, org, 'EXCO', 'SECRETARY')
    await join(ben, org, 'MEMBER')
    await addRosterMember(org, { fullName: 'Ben Ong', studentId: '1000002', userId: ben.id })
  })

  beforeEach(() => {
    mail.sent.length = 0
  })

  it('emails the president and the treasurer, and nobody else', async () => {
    as(ben)
    await ok(() => requestAccess(org.slug, blank, form({ requestedOffice: 'TREASURER', reason })))
    await settled()

    expect(mail.sent).toHaveLength(1)
    const [message] = mail.sent
    expect(message.to.sort()).toEqual([president.email, treasurer.email].sort())
    expect(message.subject).toBe('Ben Ong asked for exco access')
    expect(message.text).toContain('ben@gmail.com')
    expect(message.text).toContain('as Treasurer')
    expect(message.text).toContain(reason)
    expect(message.text).toContain(`/${org.slug}/settings/access`)
  })

  it('sends nothing for a request that was refused', async () => {
    as(ben)
    const again = await requestAccess(org.slug, blank, form({ requestedOffice: 'TREASURER', reason }))
    expect(again.error).toMatch(/already have a request waiting/)
    await settled()
    expect(mail.sent).toHaveLength(0)
  })

  it('emails every exco member when neither post is filled', async () => {
    await dbAdmin.accessRequest.deleteMany({ where: { orgId: org.id } })
    await dbAdmin.organisationMembership.updateMany({
      where: { orgId: org.id, office: { in: ['PRESIDENT', 'TREASURER'] } },
      data: { office: 'OTHER' },
    })

    as(ben)
    await ok(() => requestAccess(org.slug, blank, form({ requestedOffice: 'SECRETARY', reason })))
    await settled()

    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].to.sort()).toEqual([president.email, secretary.email, treasurer.email].sort())
  })
})
