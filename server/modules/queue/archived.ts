import { queueDb } from '@/modules/database/index.js';

/**
 * quests priority queue: the archive. Noam presses the archive icon on a chat's line: the chat leaves the list
 * and its groups for the "Archived" drawer, whatever it does later, until he takes it out again. Kept in the
 * local database under one key, as the dismissals are.
 */

const KEY = 'archived';

/** Entry key -> when it was archived (epoch ms). Entries archived before the time was kept hold `true`: time 0. */
const read = (): Record<string, number | true> => queueDb.getState<Record<string, number | true>>(KEY) ?? {};

/** When the entry was archived (epoch ms), or undefined. */
export function archivedAt(entryKey: string): number | undefined {
  const v = read()[entryKey];
  return v === undefined ? undefined : v === true ? 0 : v;
}

export function setArchived(entryKey: string, archived: boolean): void {
  const all = read();
  if (archived) all[entryKey] = Date.now();
  else delete all[entryKey];
  queueDb.setState(KEY, all);
}

/**
 * "Send to the end of the queue" on an archived entry: the drawer lists the newest archive first, so the end
 * is the oldest; the entry is marked archived before every other one (Noam, 3 Nov: "send to end of queue does
 * nothing from archived").
 */
export function setArchivedOldest(entryKey: string): void {
  const all = read();
  if (all[entryKey] === undefined) return;
  const oldest = Math.min(...Object.values(all).map((v) => (v === true ? 0 : v)));
  all[entryKey] = oldest - 1;
  queueDb.setState(KEY, all);
}
