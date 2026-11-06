import { useCallback, useId, useSyncExternalStore } from 'react';

/**
 * quests: the per-row open state (requirement 52, point 5): a row drawn closed stays closed until Noam clicks
 * it, and what a click set survives every re-render and remount, because it lives here, keyed by the row's
 * id, never in a component's own state.
 *
 * Keys: a row id (a collapsed tool line), `group:<first row id>` (a tool group's chevron), `report:<row id>`
 * (a handed-in report's frame), `card:<tool id>` (an agent's or a workflow's card), `fold:<fold id>`.
 */
/**
 * A collapsed tool line (cloudcli-custom.css, the same selector): a tool group, or an assistant row without the
 * plain-text block; anything with an input field (a question waiting for an answer) never collapses.
 */
export const TOOL_LINE = ':is(.chat-message.tool, .chat-message.assistant:not(:has(> .w-full > .w-full > div[dir="auto"]))):not(:has(input, textarea))';

/** Opens the chat's last tool row and scrolls it into view: what a click on the running step shows. */
export function revealLastToolRow(): void {
  const rows = document.querySelectorAll<HTMLElement>(`[data-chat-view="shown"] .chat-messages-pane ${TOOL_LINE}`);
  const row = rows[rows.length - 1];
  if (!row) return;
  if (row.dataset.rowId) setRowOpen(row.dataset.rowId, true);
  row.scrollIntoView({ block: 'center' });
}

const open = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const isRowOpen = (key: string): boolean => open.has(key);

export function setRowOpen(key: string, value: boolean): void {
  if (open.has(key) === value) return;
  if (value) open.add(key); else open.delete(key);
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * The row's open state and a toggle for its click handler. A key with no id behind it (a card rendered outside
 * a transcript, as in a test) falls back to one per component instance, so unrelated cards never share a state.
 */
export function useRowOpen(rawKey: string): [boolean, () => void] {
  const instance = useId();
  const key = rawKey === '' || rawKey.endsWith(':') ? `${rawKey}${instance}` : rawKey;
  // The third argument: the transcript export renders rows with the server renderer, which asks for it.
  const value = useSyncExternalStore(subscribe, () => open.has(key), () => open.has(key));
  const toggle = useCallback(() => setRowOpen(key, !open.has(key)), [key]);
  return [value, toggle];
}

/** Every open key, for the ledger's save (ledgerStorage.ts picks the ones that belong to a chat). */
export const openKeys = (): Iterable<string> => open;

/** The keys a stored ledger had open, when it loads. */
export function seedRowOpen(keys: Iterable<string>): void {
  let added = false;
  for (const key of keys) {
    if (!open.has(key)) { open.add(key); added = true; }
  }
  if (!added) return;
  version += 1;
  for (const listener of listeners) listener();
}

/** Called back on every change: the store saves the active chat's open state with its ledger. */
export function onRowOpenChange(listener: () => void): () => void {
  return subscribe(listener);
}

/** For tests: every row closed again. The page never calls this; a drawn state is only changed by a click. */
export function resetRowOpen(): void {
  open.clear();
  version += 1;
  for (const listener of listeners) listener();
}

/** Re-renders the caller on any change, for code that reads many keys at once (the pane's folds). */
export function useRowOpenVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
