import { describe, it, expect } from 'vitest';
import { encodeInput, decodeInput, shareHash, parseShareHash } from './shareLink';
import { makeInput } from './tax/testUtils';

const sample = makeInput({
  filingStatus: 'mfj',
  taxYear: 2025,
  wages: 245000,
  retirementIncome: 30000,
  interest: 4000,
  nonQualifiedDividends: 5000,
  qualifiedDividends: 70000,
});

describe('encodeInput / decodeInput', () => {
  it('round-trips a full input', () => {
    expect(decodeInput(encodeInput(sample))).toEqual(sample);
  });

  it('produces readable named params with a version marker', () => {
    const encoded = encodeInput(sample);
    expect(encoded).toContain('v=1');
    expect(encoded).toContain('filing=mfj');
    expect(encoded).toContain('wages=245000');
    expect(encoded).toContain('retire=30000');
    expect(encoded).toContain('qd=70000');
  });

  it('omits zero-valued amounts to keep the link short', () => {
    const encoded = encodeInput(sample); // shortTermGains + longTermGains are 0
    expect(encoded).not.toContain('stcg=');
    expect(encoded).not.toContain('ltcg=');
  });

  it('clamps a negative on the non-capital-gains fields to 0', () => {
    expect(decodeInput(encodeInput({ ...sample, wages: -500 }))?.wages).toBe(0);
  });

  it('round-trips a negative capital gain (a shared loss)', () => {
    const withLoss = { ...sample, shortTermGains: -500, longTermGains: -1200 };
    const encoded = encodeInput(withLoss);
    expect(encoded).toContain('stcg=-500');
    expect(encoded).toContain('ltcg=-1200');
    expect(decodeInput(encoded)).toEqual(withLoss);
  });

  it('omits a non-finite capital-gains amount rather than emitting NaN/Infinity', () => {
    // A signed field is emitted when `!== 0`, which NaN/Infinity satisfy; without a finite
    // guard the link would carry `stcg=NaN` and decode back to 0, silently losing the value.
    expect(encodeInput({ ...sample, shortTermGains: NaN })).not.toContain('stcg=');
    expect(encodeInput({ ...sample, longTermGains: Infinity })).not.toContain('ltcg=');
  });

  it('defaults missing amounts to 0 and a missing year to the default', () => {
    expect(decodeInput('v=1&filing=single')).toEqual({
      filingStatus: 'single',
      taxYear: 2026,
      wages: 0,
      retirementIncome: 0,
      interest: 0,
      nonQualifiedDividends: 0,
      shortTermGains: 0,
      qualifiedDividends: 0,
      longTermGains: 0,
      deduction: null,
    });
  });

  it('carries the tax year in the link and round-trips it', () => {
    expect(encodeInput(sample)).toContain('y=2025');
    expect(decodeInput(encodeInput(sample))?.taxYear).toBe(2025);
  });

  it('falls back to the default year for an unsupported or non-numeric year', () => {
    expect(decodeInput('v=1&filing=single&y=1999')?.taxYear).toBe(2026);
    expect(decodeInput('v=1&filing=single&y=abc')?.taxYear).toBe(2026);
  });

  it('treats a non-numeric amount as 0', () => {
    expect(decodeInput('v=1&filing=single&wages=abc')?.wages).toBe(0);
  });

  it('returns null for an unknown filing status', () => {
    expect(decodeInput('v=1&filing=bogus')).toBeNull();
  });

  it('returns null for inherited Object.prototype keys (regression: `in` would accept "toString")', () => {
    expect(decodeInput('v=1&filing=toString')).toBeNull();
    expect(decodeInput('v=1&filing=constructor')).toBeNull();
  });

  it('returns null for a version that does not match SHARE_VERSION', () => {
    // A link written by a future format must not be silently parsed under the v1 rules.
    expect(decodeInput('v=2&filing=single')).toBeNull();
    expect(decodeInput('v=&filing=single')).toBeNull();
  });

  it('returns null without the version marker', () => {
    expect(decodeInput('filing=single&wages=100')).toBeNull();
    expect(decodeInput('')).toBeNull();
  });
});

describe('shareHash / parseShareHash', () => {
  it('round-trips through a #hash', () => {
    expect(parseShareHash(shareHash(sample))).toEqual(sample);
  });

  it('starts the hash with the version marker', () => {
    expect(shareHash(sample).startsWith('#v=1')).toBe(true);
  });

  it('returns null when the hash has no share payload', () => {
    expect(parseShareHash('')).toBeNull();
    expect(parseShareHash('#other=1')).toBeNull();
  });
});

describe('deduction encoding', () => {
  it('omits the ded param when deduction is null (standard mode)', () => {
    expect(encodeInput({ ...sample, deduction: null })).not.toContain('ded=');
  });

  it('includes ded param when deduction is a custom number', () => {
    expect(encodeInput({ ...sample, deduction: 25000 })).toContain('ded=25000');
  });

  it('round-trips a custom deduction', () => {
    const withCustom = { ...sample, deduction: 25000 };
    expect(decodeInput(encodeInput(withCustom))).toEqual(withCustom);
  });

  it('decodes to null when ded param is absent (backward-compatible with old links)', () => {
    const decoded = decodeInput(encodeInput({ ...sample, deduction: null }));
    expect(decoded?.deduction).toBeNull();
  });

  it('decodes an invalid ded param to null', () => {
    const decoded = decodeInput(`v=1&filing=single&ded=abc`);
    expect(decoded?.deduction).toBeNull();
  });

  it('decodes a negative ded param to null', () => {
    const decoded = decodeInput(`v=1&filing=single&ded=-500`);
    expect(decoded?.deduction).toBeNull();
  });

  it('decodes a present-but-blank ded param to null (standard), not a custom $0', () => {
    // Number('') is 0, which would otherwise slip past coerceDeduction as a valid custom zero.
    expect(decodeInput(`v=1&filing=single&ded=`)?.deduction).toBeNull();
    expect(decodeInput(`v=1&filing=single&ded=%20`)?.deduction).toBeNull();
  });

  it('preserves a real custom $0 deduction (ded=0)', () => {
    expect(decodeInput(`v=1&filing=single&ded=0`)?.deduction).toBe(0);
  });
});
