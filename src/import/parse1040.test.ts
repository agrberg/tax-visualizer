import { describe, it, expect } from 'vitest'
import { parse1040 } from './parse1040'

describe('parse1040 (stub)', () => {
  it('resolves with no detected fields and a non-empty warning', async () => {
    const file = new File(['%PDF-1.4'], 'return.pdf', { type: 'application/pdf' })
    const result = await parse1040(file)
    expect(result.fields).toEqual({})
    expect(result.provenance).toEqual({})
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
