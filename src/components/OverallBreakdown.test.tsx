import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverallBreakdown } from './OverallBreakdown';
import { TooltipProvider } from '@/components/ui/tooltip';
import { calculateTax } from '@/tax/calculate';
import type { TaxInput } from '@/tax/types';
import { makeInput } from '@/tax/testUtils';

// OverallBreakdown renders the engine's output, so drive it with a real TaxResult.
function renderBreakdown(taxInput: TaxInput) {
  return render(
    <TooltipProvider>
      <OverallBreakdown result={calculateTax(taxInput)} />
    </TooltipProvider>,
  );
}

// Marimekko-only copy — a stable signal for which composition view is showing.
const MARIMEKKO_ONLY = 'Share of income vs. share of tax';

describe('OverallBreakdown', () => {
  it('shows the headline stats', () => {
    renderBreakdown(makeInput({ wages: 100000 }));
    // Some labels ("Total tax", "Take-home") also appear in the breakout tooltip / source
    // table, so assert each renders at least once rather than uniquely.
    for (const label of ['Total income', 'Total tax', 'Take-home', 'Weighted rate']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('toggles composition views when there is tax', async () => {
    const user = userEvent.setup();
    renderBreakdown(makeInput({ wages: 100000 }));

    // Paired bars is the default; the Marimekko chart is not shown yet.
    expect(screen.queryByText(MARIMEKKO_ONLY)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Marimekko' }));
    expect(screen.getByText(MARIMEKKO_ONLY)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Both' }));
    expect(screen.getByText(MARIMEKKO_ONLY)).toBeInTheDocument();

    // Toggling back to bars-only hides the Marimekko again (proves the toggle flips both ways).
    await user.click(screen.getByRole('button', { name: 'Paired bars' }));
    expect(screen.queryByText(MARIMEKKO_ONLY)).not.toBeInTheDocument();
  });

  it('hides the view toggle when there is no tax', () => {
    renderBreakdown(makeInput({ wages: 0 }));
    expect(screen.queryByRole('button', { name: 'Marimekko' })).not.toBeInTheDocument();
    expect(screen.getByText('Enter income to see the breakdown.')).toBeInTheDocument();
  });

  it('explains a net capital loss', () => {
    renderBreakdown(makeInput({ wages: 100000, shortTermGains: -10000 }));
    expect(screen.getByText(/offsets ordinary income this year/i)).toBeInTheDocument();
  });
});
