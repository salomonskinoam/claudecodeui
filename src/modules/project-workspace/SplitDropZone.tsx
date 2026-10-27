import { useState, type DragEvent } from 'react';

import { cn } from '@/shared/utils';
import { TAB_DRAG_TYPE, useTabDragging } from '@/modules/project-workspace/tabDrag';

export type SplitSide = 'left' | 'right';

/**
 * quests: the split-screen target over the shown chat. While a tab is dragged it covers the chat in two halves;
 * the half under the mouse lights up, and a drop there reports the tab and the side. Nothing is shown otherwise.
 */
export default function SplitDropZone({ onDrop }: { onDrop: (tabId: string, side: SplitSide) => void }) {
  const dragging = useTabDragging();
  const [side, setSide] = useState<SplitSide | null>(null);
  if (!dragging) return null;
  const sideAt = (event: DragEvent<HTMLElement>): SplitSide => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX < box.left + box.width / 2 ? 'left' : 'right';
  };
  return (
    <div
      data-quests-split="drop"
      className="absolute inset-0 z-20 flex"
      onDragOver={(event) => { event.preventDefault(); setSide(sideAt(event)); }}
      onDragLeave={() => setSide(null)}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData(TAB_DRAG_TYPE);
        setSide(null);
        if (id) onDrop(id, sideAt(event));
      }}
    >
      {(['left', 'right'] as const).map((half) => (
        <div key={half} className={cn('pointer-events-none flex-1', side === half && 'bg-primary/20 outline outline-2 -outline-offset-2 outline-primary')} />
      ))}
    </div>
  );
}
