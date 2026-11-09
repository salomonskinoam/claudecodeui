// quests: the manager of the chat services (one user unit per chat). The page server routes the browser's chat
// socket through it and starts services; the state copy is server/shared/runtime-state.ts.
export { handleBrowserChat } from './router.js';
export { controlConnection, ensureHost, sendToChat, socketAnswers, unitActive } from './hosts.js';
