import { queueDb } from '@/modules/database/index.js';

/**
 * quests priority queue: the dismissals. Noam presses the trash icon on a chat's line ("hide until it replies
 * again"): the queue records which reply he dismissed, by the reply's time. The chat is hidden while that reply
 * is still its last one; a newer reply ends the dismissal. Kept in the local database under one key.
 */

const KEY = 'dismissed';

const read = (): Record<string, string> => queueDb.getState<Record<string, string>>(KEY) ?? {};

/** The time of the reply Noam dismissed on this entry, or undefined. */
export const dismissedAt = (entryKey: string): string | undefined => read()[entryKey];

/** Records the dismissal of the entry's current reply (`replyAt`: its time, or 'none' for a chat without one). */
export function dismiss(entryKey: string, replyAt: string): void {
  queueDb.setState(KEY, { ...read(), [entryKey]: replyAt });
}
