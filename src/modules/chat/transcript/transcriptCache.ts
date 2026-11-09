import type { NormalizedMessage } from '@/shared/types';

/**
 * quests: a cache of the server's rows per chat, for fast showing (Noam, 9 Nov: "there should still be a cache for
 * fast showing. but it should be updated like caches get updated, not like another source of truth"). It holds the
 * last window the server sent and the chat's open rows; the next server read is placed over it by position and
 * overwrites it. IndexedDB, the 3000 newest rows of a chat, the 50 most recently saved chats.
 */

const DB_NAME = 'quests-chat-cache';
const STORE = 'chats';
export const ROW_CAP = 3000;
export const CHAT_CAP = 50;

export type CachedChat = {
  sessionId: string;
  start: number;
  rows: NormalizedMessage[];
  open: string[];
  savedAt: number;
};

const hasIndexedDb = (): boolean => typeof indexedDB !== 'undefined';

// The ledger this cache replaced kept its own copy of every chat; it goes once.
if (hasIndexedDb()) {
  try { indexedDB.deleteDatabase('quests-chat-ledger'); } catch { /* nothing stored */ }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'sessionId' }).createIndex('savedAt', 'savedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
}

const done = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/** The cached window of a chat, or null: none, or no storage here. */
export async function loadCachedChat(sessionId: string): Promise<CachedChat | null> {
  if (!hasIndexedDb()) return null;
  try {
    const db = await openDb();
    try {
      return (await done(db.transaction(STORE, 'readonly').objectStore(STORE).get(sessionId)) as CachedChat | undefined) ?? null;
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('[cache] could not load', sessionId, error);
    return null;
  }
}

/** Overwrites a chat's cached window (capped to its newest rows) and prunes the oldest chats. */
export async function saveCachedChat(chat: Omit<CachedChat, 'savedAt'>): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const cut = Math.max(0, chat.rows.length - ROW_CAP);
      await done(store.put({ ...chat, start: chat.start + cut, rows: chat.rows.slice(cut), savedAt: Date.now() } satisfies CachedChat));
      const keys = await done(store.index('savedAt').getAllKeys()) as IDBValidKey[];
      for (const key of keys.slice(0, Math.max(0, keys.length - CHAT_CAP))) {
        if (key !== chat.sessionId) await done(store.delete(key));
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('[cache] could not save', chat.sessionId, error);
  }
}

/** The open keys that belong to a chat's rows: the rows, their frames, groups, cards and folds. */
export function openKeysOf(rows: NormalizedMessage[], openKeys: Iterable<string>): string[] {
  const mine = new Set<string>();
  for (const row of rows) {
    mine.add(row.id);
    mine.add(`report:${row.id}`);
    mine.add(`group:${row.id}`);
    if (row.toolId) mine.add(`card:${row.toolId}`);
    if (row.foldId) mine.add(`fold:${row.foldId}`);
  }
  return [...openKeys].filter((key) => mine.has(key));
}
