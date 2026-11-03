import type { Ledger } from '@/modules/chat/ledger/chatLedger';
import { mergeLedgers } from '@/modules/chat/ledger/chatLedger';

/**
 * quests: the ledger persisted per viewer (requirement 52): IndexedDB, one record per chat, so a reload draws the
 * chat exactly as it was, folds and open rows included, and only adds what came after. Two windows on one chat
 * each save: the stored order stands and the other window's rows follow (mergeLedgers).
 *
 * Caps: the 3000 newest rows of a chat (older ones come back as a head block from an older read), the 50 most
 * recently saved chats.
 */

const DB_NAME = 'quests-chat-ledger';
const STORE = 'ledgers';
const DB_VERSION = 1;
export const ROW_CAP = 3000;
export const CHAT_CAP = 50;

type StoredLedger = Omit<Ledger, 'queued'> & { savedAt: number };

const hasIndexedDb = (): boolean => typeof indexedDB !== 'undefined';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionId' }).createIndex('savedAt', 'savedAt');
      }
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

/** The stored ledger of a chat, or null: none, another version, or no storage here. */
export async function loadLedger(sessionId: string): Promise<Ledger | null> {
  if (!hasIndexedDb()) return null;
  try {
    const db = await openDb();
    try {
      const record = await done(db.transaction(STORE, 'readonly').objectStore(STORE).get(sessionId)) as StoredLedger | undefined;
      if (!record || record.v !== 1) return null;
      const { savedAt: _savedAt, ...ledger } = record;
      return { ...ledger, queued: [] };
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('[ledger] could not load', sessionId, error);
    return null;
  }
}

/**
 * Saves a chat's ledger with the open keys that belong to it, merged over what another window stored, capped,
 * and prunes the store to the most recent chats.
 */
export async function saveLedger(ledger: Ledger, open: Record<string, true>): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const stored = await done(store.get(ledger.sessionId)) as StoredLedger | undefined;
      const mine: Ledger = { ...ledger, open };
      const merged = stored && stored.v === 1 ? mergeLedgers({ ...stored, queued: [] }, mine) : mine;
      const rows = merged.rows.length > ROW_CAP ? merged.rows.slice(-ROW_CAP) : merged.rows;
      const { queued: _queued, ...record } = { ...merged, rows };
      await done(store.put({ ...record, savedAt: Date.now() } satisfies StoredLedger));
      // The oldest chats beyond the cap go.
      const keys = await done(store.index('savedAt').getAllKeys()) as IDBValidKey[];
      for (const key of keys.slice(0, Math.max(0, keys.length - CHAT_CAP))) {
        if (key !== ledger.sessionId) await done(store.delete(key));
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
    console.warn('[ledger] could not save', ledger.sessionId, error);
  }
}

/** The open keys that belong to a ledger: its rows, their frames, groups, cards and folds. */
export function openKeysOf(ledger: Ledger, openKeys: Iterable<string>): Record<string, true> {
  const mine = new Set<string>();
  for (const row of ledger.rows) {
    mine.add(row.id);
    mine.add(`report:${row.id}`);
    mine.add(`group:${row.id}`);
    if (row.toolId) mine.add(`card:${row.toolId}`);
    if (row.foldId) mine.add(`fold:${row.foldId}`);
  }
  const out: Record<string, true> = {};
  for (const key of openKeys) if (mine.has(key)) out[key] = true;
  return out;
}
