import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

const INPUT_KEY = 'tax-visualizer:input:v1';
const SCENARIOS_KEY = 'tax-visualizer:saved:v1';

function Boom(): never {
  throw new Error('render failure');
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(INPUT_KEY, '{}');
  localStorage.setItem(SCENARIOS_KEY, '{}');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ErrorBoundary', () => {
  it('resets only the current input and keeps saved scenarios', async () => {
    const onReload = vi.fn();
    render(
      <ErrorBoundary onReload={onReload}>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset current input & reload' }));
    expect(localStorage.getItem(INPUT_KEY)).toBeNull();
    expect(localStorage.getItem(SCENARIOS_KEY)).toBe('{}');
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('deletes saved scenarios too when asked', async () => {
    const onReload = vi.fn();
    render(
      <ErrorBoundary onReload={onReload}>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete saved scenarios too & reload' }));
    expect(localStorage.getItem(INPUT_KEY)).toBeNull();
    expect(localStorage.getItem(SCENARIOS_KEY)).toBeNull();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('reloads without the share-link hash so a crashing shared link is not reloaded into the same crash', async () => {
    const replace = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('location', { pathname: '/tax/', search: '?x=1', hash: '#v=1&filing=single', replace, reload });
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset current input & reload' }));
    expect(replace).toHaveBeenCalledWith('/tax/?x=1');
    expect(reload).not.toHaveBeenCalled();
  });

  it('renders children normally and shows no recovery buttons when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
