// quests priority queue. What the rest of the page touches:
//   the two widgets of the session list, and the banner of a chat held by another editor
//   the look of a chat on a tab (family color, kind sign, shared hover)
//   the queue itself, and the report of this window's open tabs
//   the shown chat (the workspace reports it) and moving between chats
export { default as QueueList } from '@/modules/queue/QueueList';
export { default as QueueForest } from '@/modules/queue/QueueForest';
export { default as OutsideChatBanner } from '@/modules/queue/OutsideChatBanner';
export { default as KindSign } from '@/modules/queue/KindSign';
export { default as DoneButton } from '@/modules/queue/DoneButton';
export { useChatLook } from '@/modules/queue/entryLook';
export { reportPageTabs, useQueue } from '@/modules/queue/queueStore';
export type { Queue, QueueEntry, QueueKind } from '@/modules/queue/types';
export { noteShownChat } from '@/modules/queue/shownChat';
export { openNextInQueue } from '@/modules/queue/queueNavigation';
