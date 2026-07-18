import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeductionControl } from './DeductionControl'

// 2026 single standard deduction is $16,100.
const STANDARD = 16100

function renderControl(value: number | null, onChange = vi.fn()) {
  return render(
    <DeductionControl value={value} onChange={onChange} filingStatus="single" taxYear={2026} />,
  )
}

describe('DeductionControl', () => {
  it('selects Standard when value is null', () => {
    renderControl(null)
    expect((screen.getByRole('radio', { name: 'Standard' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Itemized' }) as HTMLInputElement).checked).toBe(false)
  })

  it('selects Itemized when value is a number', () => {
    renderControl(20000)
    expect((screen.getByRole('radio', { name: 'Standard' }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('radio', { name: 'Itemized' }) as HTMLInputElement).checked).toBe(true)
  })

  it('selecting Itemized seeds onChange with the standard amount', async () => {
    const onChange = vi.fn()
    renderControl(null, onChange)
    await userEvent.click(screen.getByRole('radio', { name: 'Itemized' }))
    expect(onChange).toHaveBeenCalledWith(STANDARD)
  })

  it('selecting Standard calls onChange(null)', async () => {
    const onChange = vi.fn()
    renderControl(20000, onChange)
    await userEvent.click(screen.getByRole('radio', { name: 'Standard' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('shows the standard amount as help text and no custom input when standard', () => {
    renderControl(null)
    expect(screen.queryByRole('textbox', { name: 'Itemized deduction amount' })).toBeNull()
    expect(screen.getByText(/Standard deduction: \$16,100/)).toBeTruthy()
  })

  it('shows the named custom input pre-filled when custom', () => {
    renderControl(20000)
    const input = screen.getByRole('textbox', { name: 'Itemized deduction amount' }) as HTMLInputElement
    expect(input.value).toBe('20000')
  })
})
