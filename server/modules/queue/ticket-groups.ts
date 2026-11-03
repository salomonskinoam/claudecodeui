import { queueDb } from '@/modules/database/index.js';
import { AppError } from '@/shared/utils.js';

/**
 * quests priority queue: Noam's own groups of tickets inside the "Tickets-Unclaimed" drawer, named by him
 * (3 Nov: "allow me to group tickets myself with names i give myself"). One list, in his order; a ticket is in
 * one group at most. Kept in the local database under one key; the page sends the whole list on every change.
 */

const KEY = 'ticket_groups';

export type TicketGroup = { name: string; tickets: number[] };

export const getTicketGroups = (): TicketGroup[] => queueDb.getState<TicketGroup[]>(KEY) ?? [];

export function setTicketGroups(groups: unknown): TicketGroup[] {
  if (!Array.isArray(groups)) throw new AppError('groups must be a list.', { code: 'QUEUE_BAD_GROUPS', statusCode: 400 });
  const seen = new Set<number>();
  const names = new Set<string>();
  const clean: TicketGroup[] = groups.map((g) => {
    const name = typeof g?.name === 'string' ? g.name.trim() : '';
    if (!name || names.has(name)) throw new AppError('every group needs its own non-empty name.', { code: 'QUEUE_BAD_GROUPS', statusCode: 400 });
    names.add(name);
    const tickets: number[] = [];
    for (const t of Array.isArray(g.tickets) ? g.tickets : []) {
      if (!Number.isInteger(t)) throw new AppError('tickets must be numbers.', { code: 'QUEUE_BAD_GROUPS', statusCode: 400 });
      if (seen.has(t)) continue;
      seen.add(t);
      tickets.push(t);
    }
    return { name, tickets };
  });
  queueDb.setState(KEY, clean);
  return clean;
}
