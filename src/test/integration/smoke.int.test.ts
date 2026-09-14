import { beforeAll, describe, expect, it } from 'vitest'
import { saveInstructor } from '@/modules/coach-claim/actions'
import { as, createOrganisation, createUser, dbAdmin, form, join, outcome, resetDatabase } from './harness'

describe('the harness', () => {
  beforeAll(resetDatabase)

  it('runs a real action as a real exco member, through real RLS', async () => {
    const org = await createOrganisation()
    const treasurer = await createUser('Tess Treasurer')
    await join(treasurer, org, 'EXCO', 'TREASURER')

    as(treasurer)
    const result = await saveInstructor(org.slug, null, { error: null }, form({
      fullName: 'Kai Smith',
      danceStyle: 'Popping',
      engagement: 'CONTRACTED',
    }))

    expect(result.error).toBeNull()
    expect(await dbAdmin.instructor.count({ where: { orgId: org.id } })).toBe(1)
  })

  it('refuses the same action to an ordinary member', async () => {
    const org = await dbAdmin.organisation.findFirstOrThrow()
    const member = await createUser('Mo Member')
    await join(member, { id: org.id, slug: org.slug, name: org.name }, 'MEMBER')

    as(member)
    const result = await outcome(() =>
      saveInstructor(org.slug, null, { error: null }, form({
        fullName: 'Not Allowed',
        danceStyle: 'Locking',
        engagement: 'CONTRACTED',
      }))
    )

    expect(result.kind).toBe('denied')
    expect(await dbAdmin.instructor.count({ where: { orgId: org.id } })).toBe(1)
  })

  it('hides an organisation from somebody who is not in it', async () => {
    const org = await dbAdmin.organisation.findFirstOrThrow()
    const stranger = await createUser('Sam Stranger')

    as(stranger)
    const result = await outcome(() =>
      saveInstructor(org.slug, null, { error: null }, form({ fullName: 'X', danceStyle: 'Y', engagement: 'GUEST' }))
    )
    expect(result.kind).toBe('not-found')
  })
})
