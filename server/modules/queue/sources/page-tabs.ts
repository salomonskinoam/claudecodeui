/**
 * quests priority queue, source: the chats open as tabs in the page, per browser window, as the page's own
 * session ids. Two windows open at once each keep their own tabs; a window that stopped reporting for 30 seconds
 * is gone.
 */

const STALE_MS = 30_000;
const windows = new Map<string, { ids: string[]; at: number }>();

export function setPageTabs(windowId: string, pageSessionIds: string[]): void {
  windows.set(windowId, { ids: pageSessionIds, at: Date.now() });
}

/** The page session ids of every tab of every live window, in tab order. */
export function getPageTabs(): string[] {
  for (const [id, w] of windows) if (Date.now() - w.at > STALE_MS) windows.delete(id);
  return [...new Set([...windows.values()].flatMap((w) => w.ids))];
}
