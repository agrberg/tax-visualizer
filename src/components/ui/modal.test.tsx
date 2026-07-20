import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from './modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/**
 * An open Select (defaultOpen sidesteps simulating a Radix pointer open in jsdom).
 * `position="popper"` avoids item-aligned's heavier measurement, which jsdom can't do.
 */
function OpenSelect() {
  return (
    <Select defaultOpen>
      <SelectTrigger>
        <SelectValue placeholder="Pick" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value="alpha">Alpha</SelectItem>
        <SelectItem value="beta">Beta</SelectItem>
      </SelectContent>
    </Select>
  );
}

// The scroll-lock test mutates document.body; reset it so nothing leaks between tests.
afterEach(() => {
  document.body.style.overflow = '';
});

describe('Modal + Select portal wiring (regression: inert dropdown)', () => {
  // jsdom models neither the top layer nor `inert`, so it can't reproduce the
  // unclickable-dropdown symptom directly. It CAN prove the mechanism that prevents
  // it: inside a Modal, the Select content must portal INTO the dialog subtree (not
  // document.body) so it lands in the same non-inert top-layer node as the dialog.
  it('portals Select content into the dialog element when inside a Modal', () => {
    render(
      <Modal open onClose={() => {}}>
        <OpenSelect />
      </Modal>,
    );
    const dialog = document.querySelector('dialog');
    const content = document.querySelector('[data-slot="select-content"]');
    expect(dialog).not.toBeNull();
    expect(content).not.toBeNull();
    expect(dialog!.contains(content)).toBe(true);
  });

  it('portals Select content to document.body (not a dialog) outside a Modal', () => {
    render(<OpenSelect />);
    const content = document.querySelector('[data-slot="select-content"]');
    expect(content).not.toBeNull();
    // No modal → useModalContainer() is null → default body portal, not inside a dialog.
    expect(content!.closest('dialog')).toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
  });
});

describe('Modal lifecycle', () => {
  it('opens the dialog and renders children when open flips true', () => {
    const { rerender } = render(
      <Modal open={false} onClose={() => {}}>
        <p>Body content</p>
      </Modal>,
    );
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    rerender(
      <Modal open onClose={() => {}}>
        <p>Body content</p>
      </Modal>,
    );
    expect(dialog.open).toBe(true);
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('calls onClose when the dialog emits its native close event', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>x</p>
      </Modal>,
    );
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dialog.dispatchEvent(new Event('close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll while open and restores it on close', () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = render(
      <Modal open onClose={() => {}}>
        <p>x</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Modal open={false} onClose={() => {}}>
        <p>x</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('scroll');
  });
});
