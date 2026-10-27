import { useEffect, useState } from 'react';

/** The drag payload type of a tab, so drops from outside the tab rows are ignored. */
export const TAB_DRAG_TYPE = 'application/x-quests-tab';

/** True while a tab is being dragged anywhere in the window. */
export function useTabDragging(): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const start = (event: DragEvent) => setDragging(Boolean(event.dataTransfer?.types.includes(TAB_DRAG_TYPE)));
    const end = () => setDragging(false);
    window.addEventListener('dragstart', start);
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragstart', start);
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
    };
  }, []);
  return dragging;
}
