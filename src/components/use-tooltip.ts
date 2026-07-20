import { useState } from 'react';

/** Cursor-following tooltip position + visibility, shared by the towers. */
export function useTooltip() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  return {
    visible,
    pos,
    onMove: (e: React.MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    },
    onLeave: () => setVisible(false),
  };
}
