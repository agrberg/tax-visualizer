import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportReturn } from './ImportReturn'
import type { ParsedReturn } from '@/import/parsedReturn'
import { makeInput } from '@/tax/testUtils'

vi.mock('@/import/parse1040', () => ({ parse1040: vi.fn() }))
import { parse1040 } from '@/import/parse1040'

const mockParse = vi.mocked(parse1040)

function parsed(overrides: Partial<ParsedReturn> = {}): ParsedReturn {
  return { fields: {}, provenance: {}, warnings: [], assumed: {}, ...overrides }
}

function fileInput(): HTMLInputElement {
  const el = document.querySelector('input[type="file"]')
  if (!el) throw new Error('no file input')
  return el as HTMLInputElement
}

function pdf(name = 'return.pdf', sizeBytes?: number): File {
  const file = new File(['%PDF-1.7'], name, { type: 'application/pdf' })
  if (sizeBytes != null) Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

// fireEvent.change bypasses userEvent.upload's `accept`-attribute filtering, so we can
// drive the invalid-type path too.
function upload(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } })
}

beforeEach(() => mockParse.mockReset())

describe('ImportReturn file validation', () => {
  it('rejects a non-PDF without parsing', () => {
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(new File(['x'], 'notes.txt', { type: 'text/plain' }))
    expect(screen.getByText('Please choose a PDF file.')).toBeInTheDocument()
    expect(mockParse).not.toHaveBeenCalled()
  })

  it('rejects a PDF larger than 10 MB without parsing', () => {
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf('big.pdf', 11 * 1024 * 1024))
    expect(screen.getByText(/larger than 10 MB/i)).toBeInTheDocument()
    expect(mockParse).not.toHaveBeenCalled()
  })
})

describe('ImportReturn review flow', () => {
  it('opens the review modal, showing provenance for detected fields and warnings', async () => {
    mockParse.mockResolvedValueOnce(
      parsed({
        fields: { wages: 120000 },
        provenance: { wages: '1040 line 1z' },
        warnings: ['Couldn’t detect the tax year — please choose it below.'],
      }),
    )
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    expect(await screen.findByText('Review imported values')).toBeInTheDocument()
    expect(screen.getByText('from 1040 line 1z')).toBeInTheDocument()
    expect(screen.getByText(/Couldn.t detect the tax year/)).toBeInTheDocument()
  })

  it('carries a capital loss through the review and Import with its sign intact', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    mockParse.mockResolvedValueOnce(
      parsed({
        fields: { shortTermGains: -323 },
        provenance: { shortTermGains: 'Schedule D line 7 (net short-term)' },
        warnings: [],
      }),
    )
    render(<ImportReturn current={makeInput()} onApply={onApply} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    // The loss is shown in the review with its sign.
    expect(document.getElementById('import-shortTermGains')).toHaveValue('-323')

    await user.click(screen.getByRole('button', { name: 'Import' }))
    // Capital-gains sources are signed end to end — the loss reaches the engine, which nets it.
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0]).toMatchObject({ shortTermGains: -323 })
  })

  it('applies an edited field value', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    mockParse.mockResolvedValueOnce(parsed({ fields: { wages: 100000 } }))
    render(<ImportReturn current={makeInput()} onApply={onApply} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    const wages = document.getElementById('import-wages') as HTMLInputElement
    await user.clear(wages)
    await user.type(wages, '250,000')
    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(onApply.mock.calls[0][0]).toMatchObject({ wages: 250000 })
  })

  it('closes on Cancel without applying', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    mockParse.mockResolvedValueOnce(parsed({ fields: { wages: 42 } }))
    render(<ImportReturn current={makeInput()} onApply={onApply} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Review imported values')).not.toBeInTheDocument())
    expect(onApply).not.toHaveBeenCalled()
  })

  it('shows an error and opens no modal when parsing fails', async () => {
    // The component logs the failure via console.error; capture it so the expected
    // error doesn't leak to the test runner's stderr, and assert it was logged.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockParse.mockRejectedValueOnce(new Error('boom'))
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    expect(await screen.findByText(/Couldn.t read that PDF/)).toBeInTheDocument()
    expect(screen.queryByText('Review imported values')).not.toBeInTheDocument()
    expect(errorSpy).toHaveBeenCalledWith('[1040 import] parse failed:', expect.any(Error))
    errorSpy.mockRestore()
  })
})

describe('ImportReturn deduction review', () => {
  it('marks a detected standard deduction as "using the standard deduction"', async () => {
    mockParse.mockResolvedValueOnce(
      parsed({
        fields: { wages: 100000, deduction: null },
        provenance: { deduction: '1040 line 12e' },
      }),
    )
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    expect(screen.getByText(/using the standard deduction/)).toBeInTheDocument()
  })

  it('tags a detected custom deduction above the standard as itemized', async () => {
    // makeInput() defaults to single/2026; the 2026 single standard deduction is $16,100, so
    // $25,000 is itemized. The "(itemized)" tag is computed live off the draft, not carried in
    // provenance — extract1040 only ever reports the source line.
    mockParse.mockResolvedValueOnce(
      parsed({
        fields: { wages: 100000, deduction: 25000 },
        provenance: { deduction: '1040 line 12' },
      }),
    )
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    expect(screen.getByText('from 1040 line 12 (itemized)')).toBeInTheDocument()
    expect(screen.getByLabelText('Itemized deduction amount')).toHaveValue('25000')
  })

  it('does not tag a detected custom deduction at or below the standard as itemized', async () => {
    mockParse.mockResolvedValueOnce(
      parsed({
        fields: { wages: 100000, deduction: 10000 },
        provenance: { deduction: '1040 line 12' },
      }),
    )
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    expect(screen.getByText('from 1040 line 12')).toBeInTheDocument()
    expect(screen.queryByText(/\(itemized\)/)).not.toBeInTheDocument()
  })

  it('falls back to a "defaulting to standard" note when no deduction was detected', async () => {
    mockParse.mockResolvedValueOnce(parsed({ fields: { wages: 100000 } }))
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    expect(screen.getByText(/defaulting to standard deduction/)).toBeInTheDocument()
  })

  it('renders no deduction note (never "undefined —") when detected without a provenance string', async () => {
    // fields includes `deduction` (so it's "detected") but provenance omits it — the note must
    // render nothing rather than interpolate "undefined — using the standard deduction".
    mockParse.mockResolvedValueOnce(parsed({ fields: { wages: 100000, deduction: null }, provenance: {} }))
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    expect(screen.queryByText(/using the standard deduction/)).not.toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it('drops the itemized tag when the user overrides a detected itemized deduction to Standard', async () => {
    const user = userEvent.setup()
    mockParse.mockResolvedValueOnce(
      parsed({
        fields: { wages: 100000, deduction: 28500 },
        provenance: { deduction: '1040 line 12' },
      }),
    )
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    expect(screen.getByText('from 1040 line 12 (itemized)')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Standard' }))

    expect(screen.getByText('from 1040 line 12 — using the standard deduction')).toBeInTheDocument()
    expect(screen.queryByText(/\(itemized\)/)).not.toBeInTheDocument()
  })
})

describe('ImportReturn confidence', () => {
  it('shows an assumed field with a verify cue rather than the confident "from" note', async () => {
    mockParse.mockResolvedValueOnce(
      parsed({
        fields: { longTermGains: 8000 },
        provenance: { longTermGains: '1040 line 7a (assumed long-term)' },
        assumed: { longTermGains: true },
      }),
    )
    render(<ImportReturn current={makeInput()} onApply={vi.fn()} />)
    upload(pdf())

    await screen.findByText('Review imported values')
    expect(screen.getByText(/assumed from 1040 line 7a.*verify/)).toBeInTheDocument()
    // The confident green wording is not used for an assumed value.
    expect(screen.queryByText('from 1040 line 7a (assumed long-term)')).not.toBeInTheDocument()
  })
})
