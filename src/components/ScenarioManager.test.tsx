import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenarioManager } from './ScenarioManager';
import { makeInput } from '@/tax/testUtils';

function renderManager() {
  const onSelectedNameChange = vi.fn();
  const onLoad = vi.fn();
  render(
    <ScenarioManager
      input={makeInput({ wages: 12345 })}
      selectedName={null}
      onSelectedNameChange={onSelectedNameChange}
      onLoad={onLoad}
    />,
  );
  return { onSelectedNameChange, onLoad };
}

async function saveAs(name: string) {
  await userEvent.type(screen.getByPlaceholderText('Name this scenario'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
}

beforeEach(() => localStorage.clear());

describe.each(['constructor', 'toString', '__proto__'])('a scenario named %s', (name) => {
  it('saves without an overwrite prompt on an empty store, then loads', async () => {
    const { onSelectedNameChange, onLoad } = renderManager();
    await saveAs(name);
    expect(screen.queryByText('Overwrite scenario?')).not.toBeInTheDocument();
    expect(onSelectedNameChange).toHaveBeenCalledWith(name);

    await userEvent.click(screen.getByRole('button', { name }));
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ wages: 12345 }));
  });

  it('prompts to overwrite once it exists', async () => {
    renderManager();
    await saveAs(name);
    await saveAs(name);
    expect(screen.getByText('Overwrite scenario?')).toBeInTheDocument();
  });
});

describe('renaming', () => {
  it('shows no collision warning for a name that only exists on Object.prototype', async () => {
    renderManager();
    await saveAs('plain');
    await userEvent.click(screen.getByRole('button', { name: 'Rename plain' }));
    const field = screen.getByLabelText('New name');
    await userEvent.clear(field);
    await userEvent.type(field, 'constructor');
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
  });

  it('warns when the target is another saved scenario', async () => {
    renderManager();
    await saveAs('plain');
    await saveAs('other');
    await userEvent.click(screen.getByRole('button', { name: 'Rename plain' }));
    const field = screen.getByLabelText('New name');
    await userEvent.clear(field);
    await userEvent.type(field, 'other');
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
  });
});
