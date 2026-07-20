import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ModalContainerContext } from '@/components/ui/modal-context';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** id of the element labelling the dialog, for aria-labelledby. */
  labelledBy?: string;
  className?: string;
  /** Fixed (non-scrolling) region pinned to the top — e.g. a title + close button. */
  header?: React.ReactNode;
  /** Fixed (non-scrolling) region pinned to the bottom — e.g. an action row. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A modal built on the native `<dialog>` element's `showModal()`. Chosen over a
 * portal/overlay library because it gives us, for free: rendering in the browser's
 * top layer (no z-index juggling), a `::backdrop` we dim with Tailwind's `backdrop:`
 * variant, focus trapping, an inert background, and exactly the dismissal we want —
 * Esc closes (the native default), a backdrop click does not (there is no native
 * light-dismiss, so we simply don't add one). The only bridge to React is syncing the
 * imperative open/close with the `open` prop below.
 */
export function Modal({ open, onClose, labelledBy, className, header, footer, children }: ModalProps) {
  // A callback ref (state) rather than useRef so the container context updates once the
  // dialog mounts, giving portaled overlays a target to render into.
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, dialog]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={setDialog}
      aria-labelledby={labelledBy}
      onClose={onClose}
      className={cn(
        // A flex column so the header and footer stay fixed while only the body scrolls.
        // `open:flex` (not plain `flex`) so a closed dialog keeps the user-agent
        // `display: none` — a bare `display` utility would override it and paint the
        // modal's contents in the page while it's closed.
        'fixed inset-0 m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden open:flex',
        // p-0 overrides the native <dialog> user-agent padding; padding lives on the regions.
        'rounded-lg border bg-background p-0 text-foreground shadow-lg',
        'backdrop:bg-black/50',
        className,
      )}
    >
      <ModalContainerContext.Provider value={dialog}>
        {header && <div className="shrink-0 border-b px-6 py-4">{header}</div>}
        <div className={cn('min-h-0 overflow-y-auto px-6', header ? 'pt-4' : 'pt-6', footer ? 'pb-4' : 'pb-6')}>
          {children}
        </div>
        {footer && <div className="shrink-0 border-t px-6 py-4">{footer}</div>}
      </ModalContainerContext.Provider>
    </dialog>
  );
}
