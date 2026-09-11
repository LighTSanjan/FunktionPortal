import { describe, expect, it } from 'vitest'
import { resolveNav, resolveNavGroups } from '@/modules/register'

describe('navigation', () => {
  it('groups the exco portal by what they came to do', () => {
    expect(
      resolveNavGroups('EXCO').map((group) => [group.label, group.entries.map((e) => e.label)])
    ).toEqual([
      [null, ['Home']],
      ['Work', ['Coach payments', 'Subscriptions']],
      ['Records', ['Classes', 'Transactions', 'Coaches']],
      ['You', ['Your access']],
    ])
  })

  it('does not file a member’s three items under three headings', () => {
    expect(resolveNavGroups('MEMBER').map((group) => group.label)).toEqual([null])
  })

  it('shows members only sections they may open', () => {
    // Their own subscription and their own access request. Everything else in
    // the portal reads the roster, the fund balances or the register.
    expect(resolveNav('MEMBER').map((entry) => entry.label)).toEqual([
      'Home',
      'Your subscription',
      'Your access',
    ])
  })

  it('does not offer the exco both subscription screens', () => {
    // "Subscriptions" is the collection they run; "Your subscription" is the
    // one they owe. Two entries a word apart, pointing at different screens,
    // is the sort of thing that makes somebody click the wrong one twice and
    // stop trusting the sidebar.
    const labels = resolveNav('EXCO').map((entry) => entry.label)
    expect(labels).toContain('Subscriptions')
    expect(labels).not.toContain('Your subscription')
  })

  it('keeps the attendance import out of the sidebar', () => {
    // It is done once or twice a trimester and it is one of two ways to do
    // the same job. It belongs in settings, beside the roster it imports.
    expect(resolveNav('EXCO').map((entry) => entry.href)).not.toContain('/attendance')
  })
})
