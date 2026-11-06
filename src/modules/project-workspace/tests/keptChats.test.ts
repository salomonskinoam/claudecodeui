import { describe, expect, it } from 'vitest';

import { KEPT_CHATS, keepChats, nextToPreload, preloadChat, type KeptChat } from '@/modules/project-workspace/keptChats';
import type { Project, ProjectSession } from '@/shared/types';

const project = { projectId: 'p' } as Project;
const s = (id: string) => ({ id }) as ProjectSession;
const show = (prev: KeptChat[], id: string | null, tabs: string[], now: number) => keepChats(prev, project, id ? s(id) : null, tabs, now);
const keys = (kept: KeptChat[]) => kept.map((k) => k.key);

describe('keepChats', () => {
  it('keeps every open tab built, in a fixed order, and switching back reuses the same view', () => {
    let kept = show([], 'a', ['a', 'b'], 1);
    kept = show(kept, 'b', ['a', 'b'], 2);
    kept = show(kept, 'a', ['a', 'b'], 3);
    expect(keys(kept)).toEqual(['a', 'b']);
    expect(kept.find((k) => k.key === 'a')?.shownAt).toBe(3);
  });

  it('drops the view of a closed tab', () => {
    let kept = show([], 'a', ['a', 'b'], 1);
    kept = show(kept, 'b', ['b'], 2);
    expect(keys(kept)).toEqual(['b']);
  });

  it('a new chat that gets its id keeps its view', () => {
    let kept = show([], 'a', ['a', 'new-chat'], 1);
    kept = show(kept, null, ['a', 'new-chat'], 2);
    const newKey = kept[1].key;
    kept = show(kept, null, ['a', 'new-chat'], 3); // a refresh while still new: the same view
    expect(kept[1].key).toBe(newKey);
    kept = show(kept, 'n', ['a', 'n'], 4);
    expect(keys(kept)).toEqual(['a', newKey]);
    expect(kept[1].session?.id).toBe('n');
  });

  it('a hidden new chat is not kept', () => {
    let kept = show([], null, ['new-chat', 'a'], 1);
    kept = show(kept, 'a', ['new-chat', 'a'], 2);
    kept = show(kept, 'b', ['new-chat', 'a', 'b'], 3);
    expect(kept.map((k) => k.session?.id)).toEqual(['a', 'b']);
  });

  it('preloads open tabs the sidebar knows, one at a time, never past the cap, and a shown preload keeps its view', () => {
    const projects = [{ projectId: 'p', sessions: [s('a'), s('b'), s('c')] }] as unknown as Project[];
    let kept = show([], 'a', ['a', 'b', 'x', 'c'], 1);
    const first = nextToPreload(kept, ['a', 'b', 'x', 'c'], projects);
    expect(first?.session.id).toBe('b');
    kept = preloadChat(kept, first!.project, first!.session);
    expect(nextToPreload(kept, ['a', 'b', 'x', 'c'], projects)?.session.id).toBe('c'); // x is unknown: skipped
    kept = show(kept, 'b', ['a', 'b', 'x', 'c'], 2);
    expect(keys(kept)).toEqual(['a', 'b']);
    const full = Array.from({ length: KEPT_CHATS }, (_, i) => ({ key: `k${i}`, project, session: s(`k${i}`), shownAt: i + 1 }));
    expect(nextToPreload(full, ['z'], [{ projectId: 'p', sessions: [s('z')] }] as unknown as Project[])).toBeNull();
    expect(preloadChat(full, project, s('z'))).toBe(full);
  });

  it('beyond the cap, the least recently shown view goes', () => {
    const ids = Array.from({ length: KEPT_CHATS + 1 }, (_, i) => `c${i}`);
    let kept: KeptChat[] = [];
    ids.forEach((id, i) => { kept = show(kept, id, ids, i + 1); });
    expect(kept).toHaveLength(KEPT_CHATS);
    expect(keys(kept)).not.toContain('c0');
    expect(keys(kept)).toContain(ids[KEPT_CHATS]);
  });
});
