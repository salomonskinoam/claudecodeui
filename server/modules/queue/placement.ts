import { queueDb } from '@/modules/database/index.js';

/**
 * quests priority queue: where Noam put an entry. One flag per entry, three places: the queue (no record), "On
 * hold", "Archived". The line's three drawer buttons set it; they are not toggles (Noam, 3 Nov: "there should be
 * a single state flag for where a task is. these buttons just set it. they are not toggles. each button should
 * correspond to a drawer"). Inside the queue the page splits the lines by what the chat does: "Pending chats"
 * (waits for Noam) and "Active chats" (runs); a ticket no chat claimed is "Tickets-Unclaimed".
 *
 * Any activity of the chat after it was placed puts it back in the queue, from "On hold" and from "Archived"
 * alike: a message Noam sends, a turn that starts or ends, a reply (Noam, 6 Nov: "any action, agent triggered
 * or human triggered, gets chats out of on hold and back to the main queue states (pending or active). the same
 * goes for archived chats"). A hold also ends when the chat's reply changes ("it can exit if the chat speaks",
 * 3 Nov).
 */

export type Where = 'queue' | 'hold' | 'archive';
export type Placed = { where: 'hold'; replyAt: string; at: number } | { where: 'archive'; at: number };
type Stored = Record<string, Placed>;

const KEY = 'placement';

/**
 * The place of an entry whose current reply is `replyAt` and whose chat was last active at `activityAt` (epoch
 * ms, 0 for none), and since when (epoch ms; null in the queue).
 */
export function resolvePlacement(placed: Placed | undefined, replyAt: string, activityAt = 0): { where: Where; at: number | null } {
  if (!placed) return { where: 'queue', at: null };
  if (placed.where === 'hold' && placed.replyAt !== replyAt) return { where: 'queue', at: null };
  if (activityAt > placed.at) return { where: 'queue', at: null };
  return { where: placed.where, at: placed.at };
}

/**
 * The flag from the two stores it replaces ('archived': key -> time or true; 'dismissed': key -> the reply
 * time held). An entry in both was archived: the archive wins.
 */
export function migratePlacement(archived: Record<string, number | true>, dismissed: Record<string, string>): Stored {
  const out: Stored = {};
  for (const [key, replyAt] of Object.entries(dismissed)) out[key] = { where: 'hold', replyAt, at: 0 };
  for (const [key, at] of Object.entries(archived)) out[key] = { where: 'archive', at: at === true ? 0 : at };
  return out;
}

function read(): Stored {
  const stored = queueDb.getState<Stored>(KEY);
  // Placements from before their time was kept (at 0) count from now: older activity must not undo them.
  if (stored && Object.values(stored).some((p) => p.at === 0)) {
    const now = Date.now();
    const dated = Object.fromEntries(Object.entries(stored).map(([k, p]) => [k, p.at === 0 ? { ...p, at: now } : p])) as Stored;
    queueDb.setState(KEY, dated);
    return dated;
  }
  if (stored) return stored;
  const migrated = migratePlacement(queueDb.getState('archived') ?? {}, queueDb.getState('dismissed') ?? {});
  queueDb.setState(KEY, migrated);
  return migrated;
}

/** Every stored placement, read once per queue build. */
export const readPlacements = (): Stored => read();

/** Puts the entry in a place. `replyAt` is its current reply's time ('none' for a chat without one). */
export function place(key: string, where: Where, replyAt: string): void {
  const { [key]: _old, ...rest } = read();
  const now = Date.now();
  queueDb.setState(KEY, where === 'queue' ? rest : { ...rest, [key]: where === 'hold' ? { where, replyAt, at: now } : { where, at: now } });
}
