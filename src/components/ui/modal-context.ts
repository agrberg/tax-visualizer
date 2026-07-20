import { createContext, useContext } from 'react';

/**
 * The dialog element to portal overlays (Select, Tooltip) into. `showModal()` puts the
 * dialog in the browser's top layer and marks everything outside its subtree `inert`, so
 * a dropdown portaled to `document.body` renders inert and unclickable. Rendering it into
 * this element instead keeps it inside the non-inert top-layer subtree. Null outside a Modal.
 *
 * Lives in its own module (not modal.tsx) so that file exports only the `Modal` component —
 * keeps React Fast Refresh's single-concern boundary intact (react/only-export-components).
 */
export const ModalContainerContext = createContext<HTMLDialogElement | null>(null);

export function useModalContainer() {
  return useContext(ModalContainerContext);
}
