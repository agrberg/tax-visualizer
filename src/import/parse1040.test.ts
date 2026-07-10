import { describe, it, expect, vi, beforeAll } from 'vitest'
import { setImportLogging } from './importLog'
import { parse1040 } from './parse1040'

const { extractTextItems } = vi.hoisted(() => ({ extractTextItems: vi.fn() }))
vi.mock('./pdfText', () => ({ extractTextItems }))

beforeAll(() => setImportLogging(false))

describe('parse1040', () => {
  it('extracts text items from the file and maps them onto ParsedReturn fields', async () => {
    extractTextItems.mockResolvedValueOnce([
      { text: '1z', x: 40, y: 600, width: 10, page: 1 },
      { text: 'Add lines 1a through 1h', x: 70, y: 600, width: 100, page: 1 },
      { text: '118,000', x: 520, y: 600, width: 40, page: 1 },
    ])
    const file = new File(['%PDF-1.4'], 'return.pdf', { type: 'application/pdf' })

    const result = await parse1040(file)

    expect(extractTextItems).toHaveBeenCalledWith(file)
    expect(result.fields.wages).toBe(118000)
    expect(result.provenance.wages).toBe('1040 line 1z')
  })

  it('propagates errors from text extraction', async () => {
    extractTextItems.mockRejectedValueOnce(new Error('unreadable PDF'))
    const file = new File(['not a pdf'], 'return.pdf', { type: 'application/pdf' })

    await expect(parse1040(file)).rejects.toThrow('unreadable PDF')
  })
})
