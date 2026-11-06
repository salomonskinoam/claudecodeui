/** quests priority queue: the queue as the server answers it (server/modules/queue/queue.service.ts). */

export type QueueKind = 'quest' | 'sidequest' | 'blocker' | 'chat';
export type QueueState = 'permission' | 'running' | 'question' | 'done' | 'waiting' | 'blocker' | 'unclaimed' | 'none';
/** 0 a chat open right now, 1 a chat closed without /finalize-chat, 2 an unclaimed ticket. Only 2 is a level of the order. */
export type QueueGroup = 0 | 1 | 2;

export type Where = 'queue' | 'hold' | 'archive';

/**
 * The three places an entry can be put, one button each on its line and in its menu, in drawer order (Noam,
 * 3 Nov: "each button should correspond to a drawer"). "Pending chats" and "Active chats" are both the queue,
 * split by what the chat does; the queue's button always puts the entry at the end of the queue.
 */
export const PLACES: Array<{ where: Where; label: string }> = [
  { where: 'queue', label: 'To the end of the queue' },
  { where: 'hold', label: 'On hold (until its next activity)' },
  { where: 'archive', label: 'Archived' },
];

export type QueueEntry = {
  key: string;
  kind: QueueKind;
  parentKey: string | null;
  blocks: string[];
  state: QueueState;
  since: number;
  /** The entry's one name (server/modules/queue/entries.ts): the chat's name, else the ticket's title. */
  title: string;
  /** For tickets: the ticket's own title on GitHub. */
  ticketTitle: string | null;
  url: string | null;
  number: number | null;
  /** The attached chat: the page's session id (for opening) and Claude Code's. */
  sessionId: string | null;
  providerSessionId: string | null;
  projectPath: string | null;
  world: string | null;
  rootKey: string;
  group: QueueGroup;
  /** Waits for Noam's input: a permission prompt, or a question or Done he has not dismissed. The list shows these. */
  waitsForMe: boolean;
  /** The chat has a running process, whatever its state. */
  live: boolean;
  /** Noam wrote in the chat at least once; a chat that only ran on its own never waits for him. */
  started: boolean;
  /** Where Noam put the entry, one flag: the queue, "On hold" (until the chat replies again) or "Archived". */
  placement: Where;
  /** When it was put on hold or archived (epoch ms); null in the queue. */
  placedAt: number | null;
  replyAt: string | null;
  /** Open in another editor (Cursor, the Claude desktop app, a terminal): read-only in the page. */
  heldOutside: boolean;
  /** Open right now: a live Claude Code process, or a Claude tab in Cursor. */
  open: boolean;
  closingLine: string | null;
  parentChatSid: string | null;
  /** For tickets: the numbers of its open blockers (for the close popup). */
  openBlockers: number[];
  /** For tickets: the folder a new chat for it starts in. */
  startFolder: string | null;
};

/** One of Noam's groups inside the Tickets-Unclaimed drawer: his name, the ticket numbers. */
export type TicketGroup = { name: string; tickets: number[] };

export type Queue = { entries: QueueEntry[]; order: string[]; latch: string | null; view: string[]; ticketGroups: TicketGroup[] };

/**
 * The entry of a chat, by either of its ids: the page's (most tabs) or Claude Code's (a tab opened from a Cursor
 * link, or a chat the page never listed). The two differ for a few chats, and a tab may carry either.
 */
export const isChat = (e: QueueEntry, sessionId: string | null): boolean =>
  sessionId !== null && (e.sessionId === sessionId || e.providerSessionId === sessionId);
export const entryOfChat = (entries: QueueEntry[], sessionId: string | null): QueueEntry | undefined =>
  entries.find((e) => isChat(e, sessionId));
