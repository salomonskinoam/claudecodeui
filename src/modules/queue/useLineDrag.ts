import { useRef, useState, type DragEvent } from 'react';

import { dragQueue } from '@/modules/queue/queueStore';

const DRAG_TYPE = 'application/x-quests-queue';

export type LineMarker = { key: string; below: boolean };

/**
 * quests priority queue: dragging a line of the list. The list stays still; `marker` names the line under the
 * mouse and whether the dragged line lands above or below it. A drop inside the list sends the move to the
 * server (which applies the family rules); a drop outside changes nothing.
 */
export function useLineDrag(order: string[]) {
  const [marker, setMarker] = useState<LineMarker | null>(null);
  const dragged = useRef<string | null>(null);
  const beforeKey = useRef<string | null>(null);

  const end = () => {
    dragged.current = null;
    beforeKey.current = null;
    setMarker(null);
  };

  const lineProps = (key: string, draggable: boolean) => ({
    draggable,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      dragged.current = key;
      event.dataTransfer.setData(DRAG_TYPE, key);
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!dragged.current || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      const below = event.clientY >= box.top + box.height / 2;
      if (marker?.key === key && marker.below === below) return;
      setMarker({ key, below });
      // "Stand before this key" in the stored order.
      const i = order.indexOf(key);
      beforeKey.current = below ? (order.slice(i + 1).find((k) => k !== dragged.current) ?? null) : key;
    },
    onDragEnd: end,
  });

  const listProps = {
    onDragOver: (event: DragEvent<HTMLElement>) => { if (dragged.current) event.preventDefault(); },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const key = dragged.current;
      const before = beforeKey.current;
      end();
      if (key) void dragQueue(key, before);
    },
  };

  return { marker, lineProps, listProps };
}
