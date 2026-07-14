import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ShareLinkButton } from './ShareLinkButton'
import { shareHash } from '@/shareLink'
import { makeInput } from '@/tax/testUtils'

let writeText: ReturnType<typeof vi.fn>
let originalClipboard: PropertyDescriptor | undefined

// Install our own clipboard mock. We drive clicks with fireEvent (not userEvent) here
// because userEvent.setup() installs its own navigator.clipboard stub that would shadow
// this one, and the component under test calls navigator.clipboard directly.
beforeEach(() => {
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
  // Restore the original clipboard descriptor so the override doesn't leak.
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else delete (navigator as { clipboard?: unknown }).clipboard
})

function clickCopy() {
  fireEvent.click(screen.getByRole('button', { name: /copy share link/i }))
}

describe('ShareLinkButton', () => {
  it('copies a link encoding the current input and confirms', async () => {
    const taxInput = makeInput({ wages: 50000 })
    render(<ShareLinkButton input={taxInput} />)

    clickCopy()
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain(shareHash(taxInput))
  })

  it('reverts the confirmation after the timeout', async () => {
    vi.useFakeTimers()
    render(<ShareLinkButton input={makeInput()} />)

    clickCopy()
    await act(async () => {}) // flush the awaited writeText → setCopied(true)
    expect(screen.getByText('Link copied')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Copy share link')).toBeInTheDocument()
  })

  it('stays unconfirmed when the clipboard is unavailable', async () => {
    writeText.mockRejectedValueOnce(new Error('insecure context'))
    render(<ShareLinkButton input={makeInput()} />)

    clickCopy()
    await act(async () => {}) // flush the rejected writeText → catch, no state change
    expect(screen.getByText('Copy share link')).toBeInTheDocument()
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument()
  })
})
