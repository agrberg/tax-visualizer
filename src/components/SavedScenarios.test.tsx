import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedScenarios } from './SavedScenarios';
import type { Scenarios } from '@/scenarios';
import { makeInput } from '@/tax/testUtils';

function handlers() {
  return {
    onSave: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onUpdate: vi.fn(),
  };
}

describe('SavedScenarios', () => {
  it('disables Save until the name is non-blank, then saves and clears', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<SavedScenarios scenarios={{}} selectedName={null} {...h} />);

    const save = screen.getByRole('button', { name: 'Save' });
    const field = screen.getByPlaceholderText('Name this scenario');
    expect(save).toBeDisabled();

    await user.type(field, 'My plan');
    expect(save).toBeEnabled();

    await user.click(save);
    expect(h.onSave).toHaveBeenCalledWith('My plan');
    expect(field).toHaveValue('');
  });

  it('saves on Enter', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<SavedScenarios scenarios={{}} selectedName={null} {...h} />);

    await user.type(screen.getByPlaceholderText('Name this scenario'), 'Via enter{Enter}');
    expect(h.onSave).toHaveBeenCalledWith('Via enter');
  });

  it('never enables save for a whitespace-only name', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<SavedScenarios scenarios={{}} selectedName={null} {...h} />);

    await user.type(screen.getByPlaceholderText('Name this scenario'), '   ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(h.onSave).not.toHaveBeenCalled();
  });

  it('shows the empty state with no scenarios', () => {
    render(<SavedScenarios scenarios={{}} selectedName={null} {...handlers()} />);
    expect(screen.getByText('No scenarios yet')).toBeInTheDocument();
  });

  it('lists scenario names sorted, with per-row actions', () => {
    const scenarios: Scenarios = { Zeta: makeInput(), Alpha: makeInput() };
    render(<SavedScenarios scenarios={scenarios} selectedName={null} {...handlers()} />);

    const loaders = screen.getAllByRole('button', { name: /^(Alpha|Zeta)$/ });
    expect(loaders.map((b) => b.textContent)).toEqual(['Alpha', 'Zeta']);
    expect(screen.getByRole('button', { name: 'Rename Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Zeta' })).toBeInTheDocument();
  });

  it('fires the row callbacks and marks the selected row', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const scenarios: Scenarios = { Alpha: makeInput(), Beta: makeInput() };
    render(<SavedScenarios scenarios={scenarios} selectedName="Beta" {...h} />);

    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(h.onLoad).toHaveBeenCalledWith('Alpha');

    await user.click(screen.getByRole('button', { name: 'Rename Beta' }));
    expect(h.onRename).toHaveBeenCalledWith('Beta');

    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(h.onDelete).toHaveBeenCalledWith('Alpha');

    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-current', 'false');
  });
});
