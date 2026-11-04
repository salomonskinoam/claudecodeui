import { useEffect, useRef, useState } from 'react';

import { useShownChat } from '@/modules/queue/shownChat';
import { isChat, type Queue } from '@/modules/queue/types';

// The lines blinking now, and the ones "Back" makes blink again (it undoes the opening that "Next" did).
let blinkingNow = new Set<string>();
const reblink = new Set<string>();
export const isBlinking = (key: string): boolean => blinkingNow.has(key);
export const blinkAgain = (key: string): void => { reblink.add(key); };

/**
 * quests priority queue: the lines that blink. An entry ranked above the shown chat blinks from the moment it turns
 * ready for the user until it is opened or is no longer ready.
 */
export function useBlink(queue: Queue): Set<string> {
  const shownSessionId = useShownChat();
  const wasReady = useRef(new Map<string, boolean>());
  const [blinking, setBlinking] = useState<Set<string>>(new Set());
  useEffect(() => {
    const byKey = new Map(queue.entries.map((e) => [e.key, e]));
    const shownIndex = queue.view.findIndex((k) => isChat(byKey.get(k)!, shownSessionId));
    const next = new Set<string>();
    queue.view.forEach((k, i) => {
      const e = byKey.get(k);
      if (!e) return;
      const turned = e.waitsForMe && (wasReady.current.get(k) === false || reblink.has(k));
      if (e.waitsForMe && e.sessionId !== shownSessionId && (blinking.has(k) || turned) && (shownIndex < 0 || i < shownIndex)) next.add(k);
      if (next.has(k) || !e.waitsForMe) reblink.delete(k);
      wasReady.current.set(k, e.waitsForMe);
    });
    blinkingNow = next;
    if ([...next].join() !== [...blinking].join()) setBlinking(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, shownSessionId]);
  return blinking;
}
