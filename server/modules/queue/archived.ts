import { queueDb } from '@/modules/database/index.js';

/**
 * quests priority queue: the archive. Noam presses the archive icon on a chat's line: the chat leaves the list
 * and its groups for the "Archived" drawer, whatever it does later, until he takes it out again. Kept in the
 * local database under one key, as the dismissals are.
 */

const KEY = 'archived';

const read = (): Record<string, true> => queueDb.getState<Record<string, true>>(KEY) ?? {};

export const isArchived = (entryKey: string): boolean => read()[entryKey] === true;

export function setArchived(entryKey: string, archived: boolean): void {
  const all = read();
  if (archived) all[entryKey] = true;
  else delete all[entryKey];
  queueDb.setState(KEY, all);
}
