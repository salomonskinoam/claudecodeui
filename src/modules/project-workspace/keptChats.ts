import type { Project, ProjectSession } from '@/shared/types';

/**
 * quests: the chats of the left pane's open tabs stay built while hidden, so a tab switch only shows one and hides
 * the others, as a browser does (requirement 89). Noam, 6 Nov: "i expect to not notice the loading. it's all on
 * local computer, i dont see why it can't be instant."
 *
 * One entry per kept chat view. `key` is the view's React key: it never changes, so the view is never rebuilt;
 * a new chat that gets its id keeps the key it had as "New chat". The list keeps its order (a view never moves
 * in the page, which would reset its scroll); the least recently shown view beyond the cap is dropped.
 */
export type KeptChat = { key: string; project: Project; session: ProjectSession | null; shownAt: number };

// ponytail: a fixed cap; each kept view holds its rows and its own message store in memory.
export const KEPT_CHATS = 8;

export function keepChats(
  prev: KeptChat[],
  project: Project | null,
  session: ProjectSession | null,
  openTabs: string[],
  now: number,
): KeptChat[] {
  if (!project) return prev;
  const id = session?.id ?? null;
  const last = prev.reduce<KeptChat | null>((a, k) => (a && a.shownAt >= k.shownAt ? a : k), null);
  const current = prev.find((k) => id !== null && k.session?.id === id) ?? (last?.session === null ? last : undefined);
  const shown: KeptChat = { key: current?.key ?? (id ?? `new-${now}`), project, session, shownAt: now };
  // Hidden views stay while their tab is open in the left pane; a hidden "New chat" view is not kept.
  const stays = (k: KeptChat) => k.session !== null && openTabs.includes(k.session.id);
  let next = prev.flatMap((k) => (k === current ? [shown] : stays(k) ? [k] : []));
  if (!current) next.push(shown);
  while (next.length > KEPT_CHATS) {
    // The least recently shown view goes; preloaded views (shownAt 0) first.
    const oldest = next.reduce((a, k) => (k !== shown && (a === shown || k.shownAt < a.shownAt) ? k : a), shown);
    next = next.filter((k) => k !== oldest);
  }
  return next;
}

/**
 * A chat of an open tab, built in the background before it is ever shown (Noam, 6 Nov: "only the things in view
 * should render fast, and the rest can only then preload"). It joins as never shown, so it goes first at the cap;
 * none is added once the cap is reached.
 */
export function preloadChat(prev: KeptChat[], project: Project, session: ProjectSession): KeptChat[] {
  if (prev.length >= KEPT_CHATS || prev.some((k) => k.session?.id === session.id)) return prev;
  return [...prev, { key: session.id, project, session, shownAt: 0 }];
}

/** The next open left tab whose chat has no view yet, with its project and session, if the sidebar knows it. */
export function nextToPreload(
  kept: KeptChat[],
  openTabs: string[],
  projects: Project[],
): { project: Project; session: ProjectSession } | null {
  if (kept.length >= KEPT_CHATS) return null;
  for (const id of openTabs) {
    if (kept.some((k) => k.session?.id === id)) continue;
    for (const project of projects) {
      const session = project.sessions?.find((s) => s.id === id);
      if (session) return { project, session };
    }
  }
  return null;
}
