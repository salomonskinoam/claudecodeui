/** quests priority queue: the queue as the server answers it (server/modules/queue/queue.service.ts). */

export type QueueKind = 'quest' | 'sidequest' | 'blocker' | 'chat';
export type QueueState = 'permission' | 'running' | 'question' | 'done' | 'waiting' | 'blocker' | 'unclaimed' | 'none';
/** The list's groups, top to bottom: 0 open chats, 1 chats closed without /finalize-chat, 2 unclaimed tickets. */
export type QueueGroup = 0 | 1 | 2;

export type QueueEntry = {
  key: string;
  kind: QueueKind;
  parentKey: string | null;
  blocks: string[];
  state: QueueState;
  since: number;
  title: string;
  url: string | null;
  number: number | null;
  /** The attached chat: the page's session id (for opening) and Claude Code's. */
  sessionId: string | null;
  providerSessionId: string | null;
  /** The attached chat's name (rename, else Claude's title). */
  chatName: string | null;
  projectPath: string | null;
  world: string | null;
  rootKey: string;
  group: QueueGroup;
  needsNoam: boolean;
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

export type Queue = { entries: QueueEntry[]; order: string[]; latch: string | null; view: string[] };
