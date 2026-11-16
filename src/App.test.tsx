import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { shareHash } from '@/shareLink';
import { makeInput } from '@/tax/testUtils';

const KEY = 'tax-visualizer:input:v1';

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
});

describe('App persistence', () => {
  it('does not overwrite saved input when a share link is opened', () => {
    localStorage.setItem(KEY, JSON.stringify(makeInput({ wages: 11111 })));
    window.location.hash = shareHash(makeInput({ wages: 22222 }));
    render(<App />);
    expect(screen.getByLabelText('Wages / earned income')).toHaveValue('22222');
    expect(JSON.parse(localStorage.getItem(KEY)!).wages).toBe(11111);
    expect(window.location.hash).toBe('');
  });

  it('saves once the visitor edits the shared input', async () => {
    window.location.hash = shareHash(makeInput({ wages: 22222 }));
    render(<App />);
    expect(localStorage.getItem(KEY)).toBeNull();
    await userEvent.type(screen.getByLabelText('Wages / earned income'), '5');
    expect(JSON.parse(localStorage.getItem(KEY)!).wages).toBe(222225);
  });

  it('still saves the default input on a normal first visit', () => {
    render(<App />);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });
});
