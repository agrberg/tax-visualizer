import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarginalNextDollar } from './MarginalNextDollar';
import { calculateTax } from '@/tax/calculate';
import { makeInput } from '@/tax/testUtils';

describe('MarginalNextDollar', () => {
  it('adds gain cards and renames the preferential card when a capital loss changes the gain rate', () => {
    render(<MarginalNextDollar result={calculateTax(makeInput({ wages: 100000, longTermGains: -2000 }))} />);
    expect(screen.getByText('Long-term gains (with your capital loss)')).toBeInTheDocument();
    expect(screen.getByText('Qualified dividends')).toBeInTheDocument();
    expect(screen.queryByText('Qualified div. & LT gains')).not.toBeInTheDocument();
  });

  it('shows the four standard cards when there is no capital loss', () => {
    render(<MarginalNextDollar result={calculateTax(makeInput({ wages: 100000, longTermGains: 5000 }))} />);
    expect(screen.getByText('Qualified div. & LT gains')).toBeInTheDocument();
    expect(screen.queryByText(/with your capital loss/)).not.toBeInTheDocument();
  });

  it('explains the gain card without claiming a net loss when the results net to a gain', async () => {
    const result = calculateTax(makeInput({ wages: 100000, shortTermGains: 1000, longTermGains: -100 }));
    expect(result.capitalGains.netShortTerm + result.capitalGains.netLongTerm).toBeGreaterThan(0);
    render(<MarginalNextDollar result={result} />);
    await userEvent.click(screen.getByRole('button', { name: 'About Long-term gains (with your capital loss)' }));
    expect(screen.getByText(/A capital loss offsets gains, so the next dollar of long-term gain/)).toBeInTheDocument();
    expect(screen.queryByText(/net to a loss/)).not.toBeInTheDocument();
  });
});
