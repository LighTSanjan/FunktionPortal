import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/modules/fees/collection-actions', () => ({
  closeCollection: vi.fn(),
}))

import { CloseButton } from '../close-button'

describe('CloseButton', () => {
  it('explains blockers and prevents the irreversible confirmation', () => {
    render(
      <CloseButton
        orgSlug="test-club"
        termId="term-1"
        bankable="$70.00"
        blockedReason="Check 1 pending payment first."
      />
    )

    const button = screen.getByRole('button', { name: 'Bank in $70.00' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-describedby', 'close-collection-blocked')
    expect(screen.getByText(/Check 1 pending payment first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes, bank it in' })).not.toBeInTheDocument()
  })

  it('asks for confirmation when there are no blockers', () => {
    render(
      <CloseButton orgSlug="test-club" termId="term-1" bankable="$70.00" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bank in $70.00' }))
    expect(screen.getByText('This can’t be undone. Bank in $70.00?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes, bank it in' })).toBeEnabled()
  })
})
