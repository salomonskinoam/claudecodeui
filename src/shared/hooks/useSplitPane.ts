import { useMemo, useSyncExternalStore } from 'react';

/**
 * quests: chat tabs and the split screen.
 * Each pane has its own tab list. The left pane's active tab is the session in the URL; the right
 * pane is a second copy of the app in an iframe, showing one session without the sidebar.
 * Ctrl/Cmd+click on a sidebar row opens that session as a tab of the right pane.
 * The state lives in localStorage, so it survives a reload and every tab of the browser agrees on it.
 */
export type Panes = { left: string[]; right: string[]; rightActive: string | null };

const KEY = 'quests-panes';
const EVENT = 'quests-panes-change';
const EMPTY: Panes = { left: [], right: [], rightActive: null };

/** True inside the right pane's iframe. */
export const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Panes {
  try {
    const p: Panes = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
    // Stored by hand or by an old build: keep only real tab ids, so a bad entry can never blank the page.
    const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string' && id !== '') : []);
    return { left: ids(p.left), right: ids(p.right), rightActive: typeof p.rightActive === 'string' ? p.rightActive : null };
  } catch {
    return EMPTY;
  }
}

function write(update: (panes: Panes) => Panes): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(update(parse(readRaw()))));
  } catch {
    // Storage blocked: tabs simply do not persist.
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

export function usePanes(): Panes {
  const raw = useSyncExternalStore(subscribe, readRaw);
  return useMemo(() => parse(raw), [raw]);
}

const without = (ids: string[], id: string) => ids.filter((x) => x !== id);
/** The tab that takes over when `id` closes: the one after it, else the one before. */
export const neighbor = (ids: string[], id: string): string | null => {
  const i = ids.indexOf(id);
  return ids[i + 1] ?? ids[i - 1] ?? null;
};

/** The left tab of a chat that has no session id yet (the address "/"). One at a time. */
export const NEW_CHAT_TAB = 'new-chat';

export const openLeftTab = (id: string) =>
  write((p) => (p.left.includes(id) ? p : { ...p, left: [...p.left, id] }));

/** The new chat got its session id: its tab keeps its place. */
export const replaceNewChatTab = (id: string) =>
  write((p) => ({ ...p, left: p.left.includes(id) ? without(p.left, NEW_CHAT_TAB) : p.left.map((x) => (x === NEW_CHAT_TAB ? id : x)) }));

export const closeLeftTab = (id: string) => write((p) => ({ ...p, left: without(p.left, id) }));

export const openRightTab = (id: string) =>
  write((p) => ({ ...p, right: p.right.includes(id) ? p.right : [...p.right, id], rightActive: id }));

export const selectRightTab = (id: string) => write((p) => ({ ...p, rightActive: id }));

export const closeRightTab = (id: string) =>
  write((p) => ({
    ...p,
    right: without(p.right, id),
    rightActive: p.rightActive === id ? neighbor(p.right, id) : p.rightActive,
  }));

/**
 * Moves a tab by drag and drop: within its pane (reorder) or into the other pane, placed before `beforeId`
 * (null: at the end). A tab moved into the right pane becomes its active tab; a right pane left empty closes.
 * The left pane's active tab follows the URL, which the caller navigates.
 */
export const moveTab = (id: string, toPane: 'left' | 'right', beforeId: string | null) =>
  write((p) => {
    const insert = (ids: string[]) => {
      const rest = without(ids, id);
      const at = beforeId === null ? -1 : rest.indexOf(beforeId);
      return at < 0 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)];
    };
    const left = toPane === 'left' ? insert(p.left) : without(p.left, id);
    const right = toPane === 'right' ? insert(p.right) : without(p.right, id);
    const rightActive = toPane === 'right'
      ? id
      : p.rightActive === id ? neighbor(p.right, id) : p.rightActive;
    return { left, right, rightActive: right.length > 0 ? rightActive : null };
  });

/** A plan tab's id: `plan:<name>` for ~/.claude/plans/<name>.md. */
export const planTabId = (planName: string) => `plan:${planName}`;
/** The plan name of a plan tab id, else null. */
export const planNameOf = (tabId: string): string | null => (tabId.startsWith('plan:') ? tabId.slice(5) : null);

/**
 * Opens a tab right after `afterId` in a pane (at the end when `afterId` is not there), like an editor opening
 * a file next to the tab that asked for it. In the right pane it becomes the shown tab; the left pane follows
 * the URL, which the caller navigates.
 */
export const openTabAfter = (id: string, toPane: 'left' | 'right', afterId: string | null) =>
  write((p) => {
    const place = (ids: string[]) => {
      const rest = without(ids, id);
      const at = afterId === null ? -1 : rest.indexOf(afterId);
      return at < 0 ? [...rest, id] : [...rest.slice(0, at + 1), id, ...rest.slice(at + 1)];
    };
    return toPane === 'left'
      ? { ...p, left: place(p.left), right: without(p.right, id) }
      : { ...p, left: without(p.left, id), right: place(p.right), rightActive: id };
  });

/** Closes the whole right pane. */
export const closeRightPane = () => write((p) => ({ ...p, right: [], rightActive: null }));
