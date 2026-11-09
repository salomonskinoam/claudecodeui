// quests: the manager of the chat services (one user unit per chat). The page server routes the browser's chat
// socket through it, starts services, and runs the check that wakes chats and delivers listener results; the state
// copy is server/shared/runtime-state.ts.
export { handleBrowserChat } from './router.js';
export { check, onChatsChanged, startManager } from './manager.js';
