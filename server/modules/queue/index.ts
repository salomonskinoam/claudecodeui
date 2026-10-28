// quests: the chats as they are (chats.ts) and the priority queue built on them. What the rest of the server touches:
//   the HTTP surface of the queue, mounted at /api/quests/queue
//   the polls, started and stopped with the server
//   the transcript reader, which the session watcher calls on every transcript change
//   the chats' process states, for the status dots, and whether a session has a live process (the history
//   loader: an agent of a chat whose process lives is still running, not stopped)
export { default as queueRoutes } from './queue.routes.js';
export { initializeQueue, closeQueue } from './polls.js';
export { noteTranscript } from './sources/transcripts.js';
export { processStates } from './chats.js';
export { hasLiveProcess } from './sources/live.js';
