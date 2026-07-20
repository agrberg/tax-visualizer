import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IncomeForm } from './IncomeForm';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AVAILABLE_YEARS } from '@/tax/years';
import { FILING_STATUS_LABELS } from '@/tax/filingStatus';
import type { TaxInput } from '@/tax/types';
import { makeInput } from '@/tax/testUtils';

// A no-netting capital-gains summary for the CapitalNettingNote — net equals taxable, so
// the note stays inactive. These IncomeForm tests exercise the money fields and selects,
// not the netting note, so a zeroed stub keeps them focused.
const NO_NETTING = {
  netShortTerm: 0,
  netLongTerm: 0,
  taxableShortTerm: 0,
  taxableLongTerm: 0,
  lossDeduction: 0,
  carryover: { shortTerm: 0, longTerm: 0 },
};

type CapitalGains = typeof NO_NETTING;

/** Stateful wrapper so the controlled inputs accumulate edits like the real app. */
function Harness({
  onChange,
  initial,
  capitalGains = NO_NETTING,
}: {
  onChange: (v: TaxInput) => void;
  initial?: TaxInput;
  capitalGains?: CapitalGains;
}) {
  const [value, setValue] = useState<TaxInput>(initial ?? makeInput());
  return (
    <TooltipProvider>
      <IncomeForm
        value={value}
        capitalGains={capitalGains}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </TooltipProvider>
  );
}

/** A netting summary; net differs from taxable, so the CapitalNettingNote renders. */
function netting(overrides: Partial<CapitalGains> = {}): CapitalGains {
  return { ...NO_NETTING, ...overrides };
}

function field(source: string): HTMLInputElement {
  const el = document.getElementById(source);
  if (!el) throw new Error(`no field #${source}`);
  return el as HTMLInputElement;
}

describe('IncomeForm money fields', () => {
  it('renders all seven income sources', () => {
    render(<Harness onChange={vi.fn()} />);
    for (const source of [
      'wages',
      'retirementIncome',
      'interest',
      'nonQualifiedDividends',
      'shortTermGains',
      'qualifiedDividends',
      'longTermGains',
    ]) {
      expect(field(source)).toBeInTheDocument();
    }
  });

  it('renders a 0 value as an empty field (placeholder 0)', () => {
    render(<Harness onChange={vi.fn()} initial={makeInput({ wages: 0 })} />);
    expect(field('wages')).toHaveValue('');
    expect(field('wages')).toHaveAttribute('placeholder', '0');
  });

  it('accepts digits and reports the numeric value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(field('wages'), '1500');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ wages: 1500 }));
    expect(field('wages')).toHaveValue('1500');
  });

  it('strips non-digits from typed input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(field('interest'), '1,2a3');
    expect(field('interest')).toHaveValue('123');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ interest: 123 }));
  });

  it('clears back to 0 when emptied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={makeInput({ wages: 500 })} />);

    await user.clear(field('wages'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ wages: 0 }));
    expect(field('wages')).toHaveValue('');
  });
});

describe('IncomeForm selects', () => {
  it('shows the current tax year and filing status in the triggers', () => {
    render(<Harness onChange={vi.fn()} initial={makeInput({ taxYear: 2026, filingStatus: 'mfj' })} />);
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText(FILING_STATUS_LABELS.mfj)).toBeInTheDocument();
  });

  it('changes the tax year through the Select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const other = AVAILABLE_YEARS.find((y) => y !== 2026) ?? AVAILABLE_YEARS[0];
    render(<Harness onChange={onChange} initial={makeInput({ taxYear: 2026 })} />);

    await user.click(screen.getByRole('combobox', { name: /tax year/i }));
    await user.click(await screen.findByRole('option', { name: String(other) }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ taxYear: other }));
  });

  it('changes the filing status through the Select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={makeInput({ filingStatus: 'single' })} />);

    await user.click(screen.getByRole('combobox', { name: /filing status/i }));
    await user.click(await screen.findByRole('option', { name: FILING_STATUS_LABELS.mfj }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ filingStatus: 'mfj' }));
  });
});

describe('IncomeForm capital-gains netting note', () => {
  it('does not render when net equals taxable (no netting)', () => {
    render(<Harness onChange={vi.fn()} capitalGains={NO_NETTING} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('explains a net loss that offsets ordinary income and carries forward', () => {
    render(
      <Harness
        onChange={vi.fn()}
        capitalGains={netting({
          netShortTerm: -5000,
          lossDeduction: 3000,
          carryover: { shortTerm: 2000, longTerm: 0 },
        })}
      />,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/offsets ordinary income this year/i);
    expect(note).toHaveTextContent(/carry to future years/i);
  });

  it('explains a net loss with nothing deductible this year (income already $0)', () => {
    render(
      <Harness
        onChange={vi.fn()}
        capitalGains={netting({
          netShortTerm: -3000,
          lossDeduction: 0,
          carryover: { shortTerm: 3000, longTerm: 0 },
        })}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/None (of it )?offsets income this year/i);
  });

  it('explains gains reduced by a loss without netting to an overall loss', () => {
    render(
      <Harness
        onChange={vi.fn()}
        capitalGains={netting({
          netShortTerm: -2000,
          netLongTerm: 10000,
          taxableShortTerm: 0,
          taxableLongTerm: 8000,
        })}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/offset part of your gains/i);
  });
});
