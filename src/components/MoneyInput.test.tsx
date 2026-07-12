import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoneyInput } from './MoneyInput'

function field(id = 'money'): HTMLInputElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`no field #${id}`)
  return el as HTMLInputElement
}

describe('MoneyInput', () => {
  it('accepts a negative typed left-to-right when allowNegative', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyInput id="money" value={0} allowNegative onChange={onChange} />)

    await user.type(field(), '-500')
    expect(field()).toHaveValue('-500')
    expect(onChange).toHaveBeenLastCalledWith(-500)
  })

  it('keeps a lone "-" in the buffer (parsing to 0) so a loss can be entered', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyInput id="money" value={0} allowNegative onChange={onChange} />)

    await user.type(field(), '-')
    // The minus persists even though it parses to 0 — otherwise a value-derived input
    // would snap back to "" and eat it, making a loss impossible to type left-to-right.
    expect(field()).toHaveValue('-')
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('strips a typed minus when negatives are not allowed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyInput id="money" value={0} allowNegative={false} onChange={onChange} />)

    await user.type(field(), '-500')
    expect(field()).toHaveValue('500')
    expect(onChange).toHaveBeenLastCalledWith(500)
  })

  it('strips non-numeric characters', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyInput id="money" value={0} allowNegative={false} onChange={onChange} />)

    await user.type(field(), '1a2b3')
    expect(field()).toHaveValue('123')
    expect(onChange).toHaveBeenLastCalledWith(123)
  })

  it('resyncs the displayed text when the external value changes', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <MoneyInput id="money" value={0} allowNegative onChange={onChange} />,
    )
    expect(field()).toHaveValue('')

    rerender(<MoneyInput id="money" value={500} allowNegative onChange={onChange} />)
    expect(field()).toHaveValue('500')
  })

  it('does not wipe an in-progress "-" when the external value stays 0', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <MoneyInput id="money" value={0} allowNegative onChange={onChange} />,
    )

    await user.type(field(), '-')
    // A re-render while the value legitimately stays 0 (the "-" parses to 0) must not
    // clobber the in-progress edit.
    rerender(<MoneyInput id="money" value={0} allowNegative onChange={onChange} />)
    expect(field()).toHaveValue('-')
  })
})
