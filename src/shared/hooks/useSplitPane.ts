import { useSyncExternalStore } from 'react';

/**
 * quests: split screen. The right pane is a second copy of the app in an iframe, showing one
 * session without the sidebar. Ctrl/Cmd+click on a sidebar row puts that session there.
 * The choice lives in localStorage, so the iframe and every tab agree on it.
 */
const KEY = 'quests-split-session';
const EVENT = 'quests-split-change';

/** True inside the right pane's iframe. */
export const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSplitSessionId(sessionId: string | null): void {
  try {
    if (sessionId) {
      localStorage.setItem(KEY, sessionId);
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // Storage blocked: the split simply does not open.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useSplitSessionId(): string | null {
  return useSyncExternalStore(subscribe, read);
}
