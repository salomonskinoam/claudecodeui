// quests priority queue: the HTTP surface, mounted at /api/quests/queue.
export { default as queueRoutes } from './queue.routes.js';

// The polls that keep the queue's sources fresh, started and stopped with the server; the closing-line reader
// the session watcher calls on every transcript change.
export { initializeQueue, closeQueue } from './services/queue.service.js';
export { noteTranscript } from './services/queue-sources.service.js';
