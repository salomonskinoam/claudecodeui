import { useEffect, useRef, useState } from 'react';

import type { Queue } from '@/modules/queue/types';

/**
 * quests priority queue: the lines that blink. An entry ranked above the shown chat blinks from the moment it turns
 * ready for the user until it is opened or is no longer ready.
 */
export function useBlink(queue: Queue, shownSessionId: string | null): Set<string> {
  const wasReady = useRef(new Map<string, boolean>());
  const [blinking, setBlinking] = useState<Set<string>>(new Set());
  useEffect(() => {
    const byKey = new Map(queue.entries.map((e) => [e.key, e]));
    const shownIndex = queue.view.findIndex((k) => byKey.get(k)?.sessionId === shownSessionId);
    const next = new Set<string>();
    queue.view.forEach((k, i) => {
      const e = byKey.get(k);
      if (!e) return;
      const turned = e.needsNoam && wasReady.current.get(k) === false;
      if (e.needsNoam && e.sessionId !== shownSessionId && (blinking.has(k) || turned) && (shownIndex < 0 || i < shownIndex)) next.add(k);
      wasReady.current.set(k, e.needsNoam);
    });
    if ([...next].join() !== [...blinking].join()) setBlinking(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, shownSessionId]);
  return blinking;
}
