import { describe, expect, it } from 'vitest'
import { isNavEntryActive } from '@/core/navigation'
import { resolveNavGroups } from '@/modules/register'

describe('navigation', () => {
  it('groups the exco portal by what they came to do', () => {
    expect(
      resolveNavGroups('EXCO').map((group) => [group.label, group.entries.map((e) => e.label)])
    ).toEqual([
      [null, ['Home']],
      ['Work', ['Coach payments', 'Membership fees']],
      ['Records', ['Classes', 'Transactions', 'Coaches']],
      ['You', ['Your membership fee', 'Your access']],
    ])
  })

  it('does not file a member’s three items under three headings', () => {
    expect(resolveNavGroups('MEMBER').map((group) => group.label)).toEqual([null])
  })

  it('shows members only sections they may open', () => {
    expect(resolveNavGroups('MEMBER').flatMap((group) => group.entries).map((entry) => entry.label)).toEqual([
      'Home',
      'Your membership fee',
      'Your access',
    ])
  })

  it('gives the exco their own membership fee, away from the collection they run', () => {
    // The exco fill in the form and pay like everybody else, and hiding their
    // own fee left them no way to. It sits under "You", not beside
    // "Membership fees" under "Work", so the two are never a word apart.
    const groups = resolveNavGroups('EXCO')
    const work = groups.find((group) => group.label === 'Work')!.entries.map((e) => e.label)
    const you = groups.find((group) => group.label === 'You')!.entries.map((e) => e.label)
    expect(work).toContain('Membership fees')
    expect(work).not.toContain('Your membership fee')
    expect(you).toContain('Your membership fee')
  })

  it('keeps the attendance import out of the sidebar', () => {
    expect(resolveNavGroups('EXCO').flatMap((group) => group.entries).map((entry) => entry.href)).not.toContain('/attendance')
  })

  it('does not mark the collection screen as the member fee page', () => {
    expect(isNavEntryActive('/funktion/fees/collection', '/funktion/fees')).toBe(false)
    expect(isNavEntryActive('/funktion/fees', '/funktion/fees')).toBe(true)
  })
})
