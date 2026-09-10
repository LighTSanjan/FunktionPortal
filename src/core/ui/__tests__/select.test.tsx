import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Select } from '../select'

describe('Select', () => {
  it('renders an accessible <select> element', () => {
    render(
      <Select aria-label="Test select">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    )
    expect(screen.getByLabelText('Test select')).toBeInTheDocument()
    expect(screen.getByLabelText('Test select').tagName).toBe('SELECT')
  })

  it('forwards className', () => {
    render(
      <Select className="custom-class" aria-label="Styled">
        <option>X</option>
      </Select>
    )
    expect(screen.getByLabelText('Styled')).toHaveClass('custom-class')
  })

  it('forwards disabled prop', () => {
    render(
      <Select disabled aria-label="Disabled select">
        <option>X</option>
      </Select>
    )
    expect(screen.getByLabelText('Disabled select')).toBeDisabled()
  })

  it('forwards value and calls onChange', () => {
    const onChange = vi.fn()
    render(
      <Select value="a" onChange={onChange} aria-label="Controlled">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    )
    fireEvent.change(screen.getByLabelText('Controlled'), {
      target: { value: 'b' },
    })
    expect(onChange).toHaveBeenCalled()
  })

  // The rule this guards is "a select shows where focus is", not "a select
  // uses Tailwind's ring". Focus moved to the kueh lapis stack, which is a
  // box-shadow, and Tailwind's ring is also a box-shadow — keeping both meant
  // whichever rule won the cascade decided the design. The class carries the
  // whole treatment, including its reduced-motion behaviour.
  it('carries a focus treatment', () => {
    render(
      <Select aria-label="Focus test">
        <option>X</option>
      </Select>
    )
    expect(screen.getByLabelText('Focus test').className).toContain('lapis-field')
  })
})
