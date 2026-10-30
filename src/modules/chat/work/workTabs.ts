import { useSyncExternalStore } from 'react';

import { isEmbedded, openTabAfter, workTabId } from '@/shared/hooks/useSplitPane';
import type { ChatMessage } from '@/shared/types';

/**
 * quests: the work tabs. Background work a chat waits for opens as its own tab beside the chat, read-only, like a
 * plan tab: an agent (its transcript, live) or a backgrounded command (the tail of its output file, live). Noam,
 * 29 Oct: "is it possible to have the "Waiting for" chat clickable, and open it/latch onto it as a normal chat
 * and promote it into a "temporary tab"". Each parallel worker is its own tab.
 */

export type WorkKind = 'agent' | 'output';

/** The ref of an agent's tab: the chat's page session id and the agent's id (the route is /work/agent/<ref>). */
export const agentRef = (sessionId: string, agentId: string) => `${sessionId}/${agentId}`;
/** The ref of a command's tab: its output file without the leading slash (the route is /work/output/<ref>). */
export const outputRef = (file: string) => file.replace(/^\//, '');

/** The output file a backgrounded command writes to: from the live task events, else from the launch's tool result. */
export function outputFileOf(message: Pick<ChatMessage, 'taskStatus' | 'toolResult'>): string | undefined {
  if (message.taskStatus?.outputFile) return message.taskStatus.outputFile;
  const content = message.toolResult?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  return /<output-file>([^<]+)<\/output-file>/.exec(text)?.[1];
}

/** The file a watcher (the Monitor tool) tails: the first absolute path after `tail` in its command, else undefined. */
export function monitoredFileOf(message: Pick<ChatMessage, 'toolName' | 'toolInput'>): string | undefined {
  if (message.toolName !== 'Monitor') return undefined;
  let input: unknown = message.toolInput;
  try {
    input = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return undefined;
  }
  const command = input && typeof input === 'object' ? (input as { command?: unknown }).command : undefined;
  const after = typeof command === 'string' ? command.split(/\btail\b/)[1] : undefined;
  return after ? /(\/\S+)/.exec(after)?.[1] : undefined;
}

/** The chat on screen in this window, from its address (the right pane is an iframe on /session/<id> too). */
export const sessionIdFromUrl = (): string | null => /^\/session\/([^/]+)/.exec(window.location.pathname)?.[1] ?? null;

// The tab titles ("Agent: <its task>", "Command: <its description>"), kept per viewer so a reload keeps them.
const STORE = 'quests-work-titles';
let titles: Record<string, string> = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
})();
const listeners = new Set<() => void>();

export function setWorkTitle(tabId: string, title: string): void {
  if (titles[tabId] === title) return;
  titles = { ...titles, [tabId]: title };
  try {
    localStorage.setItem(STORE, JSON.stringify(titles));
  } catch {
    /* no storage: the titles hold for this page load only */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useWorkTitles = (): Record<string, string> => useSyncExternalStore(subscribe, () => titles);

// The workspace registers its navigate, so a click anywhere in the transcript can open a tab without the router.
let navigateTo: ((to: string) => void) | null = null;
export const registerWorkNavigate = (navigate: ((to: string) => void) | null): void => { navigateTo = navigate; };

/** Opens (or shows) the work tab right after the chat's tab; in the right pane when this page is the embedded one. */
export function openWorkTab(sessionId: string, kind: WorkKind, ref: string, title: string): void {
  const id = workTabId(kind, ref);
  setWorkTitle(id, title);
  openTabAfter(id, isEmbedded ? 'right' : 'left', sessionId);
  if (!isEmbedded) navigateTo?.(`/work/${kind}/${ref}`);
}
