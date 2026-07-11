import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { ModalContainerContext } from '@/components/ui/modal-context'

interface ModalProps {
  open: boolean
  onClose: () => void
  /** id of the element labelling the dialog, for aria-labelledby. */
  labelledBy?: string
  className?: string
  children: React.ReactNode
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
export function Modal({ open, onClose, labelledBy, className, children }: ModalProps) {
  // A callback ref (state) rather than useRef so the container context updates once the
  // dialog mounts, giving portaled overlays a target to render into.
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)

  useEffect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open, dialog])

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <dialog
      ref={setDialog}
      aria-labelledby={labelledBy}
      onClose={onClose}
      className={cn(
        'fixed inset-0 m-auto h-fit max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto',
        'rounded-lg border bg-background p-6 text-foreground shadow-lg',
        'backdrop:bg-black/50',
        className,
      )}
    >
      <ModalContainerContext.Provider value={dialog}>
        {children}
      </ModalContainerContext.Provider>
    </dialog>
  )
}
