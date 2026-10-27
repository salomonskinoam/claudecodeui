// quests priority queue. What the rest of the server touches:
//   the HTTP surface, mounted at /api/quests/queue
//   the polls, started and stopped with the server
//   the transcript reader, which the session watcher calls on every transcript change
export { default as queueRoutes } from './queue.routes.js';
export { initializeQueue, closeQueue } from './polls.js';
export { noteTranscript } from './sources/transcripts.js';
