import { queueDb } from '@/modules/database/index.js';
import { readMirror, scheduleMirror } from '@/modules/queue/mirror.js';

/**
 * quests priority queue: the stored order (one list of entry keys, top first) and the "on top latch", kept in
 * the local database and backed up by the mirror. Nothing is written before the mirror was read back once.
 */

let restored = false;
const snapshot = () => ({ order: readOrder(), latch: readLatch() });

export const readOrder = (): string[] => queueDb.getState<string[]>('order') ?? [];
export const readLatch = (): string | null => queueDb.getState<string | null>('latch') ?? null;

export function writeOrder(order: string[]): void {
  if (!restored || JSON.stringify(readOrder()) === JSON.stringify(order)) return;
  queueDb.setState('order', order);
  scheduleMirror(snapshot);
}

export function writeLatch(key: string | null): void {
  if (readLatch() === key) return;
  queueDb.setState('latch', key);
  scheduleMirror(snapshot);
}

/** At start: an empty local store takes the mirror's state; then writes are allowed. */
export async function restoreOrder(): Promise<void> {
  if (queueDb.getState('order') === undefined) {
    const saved = await readMirror();
    if (saved) {
      queueDb.setState('order', saved.order);
      queueDb.setState('latch', saved.latch);
    }
  }
  restored = true;
}
