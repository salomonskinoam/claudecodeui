/**
 * quests priority queue: the order. Pure functions, no imports, shared by the server and the page.
 *
 * The stored order is one list of entry keys, top first. Constraints "a above b": every blocker above each
 * entry it blocks, every open parent above its side quest. Roots keep the place they were given; new roots
 * go last. Permission prompts and the "on top latch" are applied only in the view.
 */

export type QueueKind = 'quest' | 'sidequest' | 'blocker' | 'chat';
export type QueueState = 'permission' | 'running' | 'question' | 'done' | 'waiting' | 'blocker' | 'unclaimed' | 'none';

export type QueueOrderEntry = {
  key: string;
  kind: QueueKind;
  /** The open parent's key, or null. */
  parentKey: string | null;
  /** Keys of the entries this blocker blocks. */
  blocks: string[];
  state: QueueState;
  /** Epoch milliseconds the state began. */
  since: number;
  /** The chat is open right now: a live Claude Code process, or a Claude tab in Cursor. */
  open?: boolean;
};

const NEEDS_NOAM: ReadonlySet<QueueState> = new Set(['permission', 'question', 'done', 'unclaimed']);
const TIE: Partial<Record<QueueState, number>> = { permission: 0, question: 1, done: 2 };

export const needsNoam = (e: QueueOrderEntry): boolean => NEEDS_NOAM.has(e.state);

const tieCmp = (a: QueueOrderEntry, b: QueueOrderEntry): number =>
  (TIE[a.state] ?? 3) - (TIE[b.state] ?? 3) || a.since - b.since;

const index = (entries: QueueOrderEntry[]) => new Map(entries.map((e) => [e.key, e]));

/** A quest, a chat, or an entry without an open parent is a root; else the root of its parent. */
export function rootOf(key: string, byKey: Map<string, QueueOrderEntry>): string {
  const seen = new Set<string>();
  let e = byKey.get(key)!;
  while (e.kind !== 'quest' && e.kind !== 'chat' && e.parentKey && byKey.has(e.parentKey) && !seen.has(e.key)) {
    seen.add(e.key);
    e = byKey.get(e.parentKey)!;
  }
  return e.key;
}

export function constraints(entries: QueueOrderEntry[]): Array<[string, string]> {
  const byKey = index(entries);
  const pairs: Array<[string, string]> = [];
  for (const e of entries) {
    if (e.kind === 'blocker') e.blocks.filter((k) => byKey.has(k) && k !== e.key).forEach((k) => pairs.push([e.key, k]));
    if (e.kind === 'sidequest' && e.parentKey && byKey.has(e.parentKey)) pairs.push([e.parentKey, e.key]);
  }
  return pairs;
}

/** Side quests of one parent keep their slots and sort inside them; then a stable topological sort. */
function settle(list: string[], entries: QueueOrderEntry[]): string[] {
  const byKey = index(entries);
  const out = [...list];
  const groups = new Map<string, string[]>();
  for (const k of out) {
    const e = byKey.get(k)!;
    if (e.kind === 'sidequest' && e.parentKey) groups.set(e.parentKey, [...(groups.get(e.parentKey) ?? []), k]);
  }
  for (const keys of groups.values()) {
    const slots = keys.map((k) => out.indexOf(k)).sort((a, b) => a - b);
    const sorted = keys.map((k) => byKey.get(k)!).sort(tieCmp);
    slots.forEach((slot, i) => { out[slot] = sorted[i].key; });
  }
  const present = new Set(out);
  const above = new Map<string, Set<string>>(out.map((k) => [k, new Set()]));
  for (const [a, b] of constraints(entries)) if (present.has(a) && present.has(b)) above.get(b)!.add(a);
  const placed = new Set<string>();
  const result: string[] = [];
  while (result.length < out.length) {
    let next = out.find((k) => !placed.has(k) && [...above.get(k)!].every((a) => placed.has(a)));
    if (next === undefined) {
      next = out.find((k) => !placed.has(k))!;
      console.warn(`quests queue: constraint cycle around ${next}`);
    }
    placed.add(next);
    result.push(next);
  }
  return result;
}

/** Drop closed entries, place new ones, settle. */
export function repair(stored: string[], entries: QueueOrderEntry[]): string[] {
  const byKey = index(entries);
  const list = [...new Set(stored.filter((k) => byKey.has(k)))];
  for (const n of entries.filter((e) => !list.includes(e.key)).sort(tieCmp)) {
    const root = rootOf(n.key, byKey);
    if (root === n.key) {
      list.push(n.key);
    } else if (n.kind === 'blocker' && n.blocks.some((k) => list.includes(k))) {
      list.splice(Math.min(...n.blocks.map((k) => list.indexOf(k)).filter((i) => i >= 0)), 0, n.key);
    } else {
      const family = list.map((k, i) => [k, i] as const).filter(([k]) => rootOf(k, byKey) === root);
      list.splice(family.length ? family[family.length - 1][1] + 1 : list.length, 0, n.key);
    }
  }
  return settle(list, entries);
}

function closure(start: string, pairs: Array<[string, string]>, up: boolean): Set<string> {
  const found = new Set<string>();
  const todo = [start];
  while (todo.length) {
    const k = todo.pop()!;
    for (const [a, b] of pairs) {
      const [from, to] = up ? [b, a] : [a, b];
      if (from === k && !found.has(to)) { found.add(to); todo.push(to); }
    }
  }
  return found;
}

/**
 * Move `key` to stand right before `beforeKey` (null: last). Every entry that must stay above it and now
 * stands below is lifted to just above it; every entry that must stay below it and now stands above is
 * dropped to just below it: the dragged block grows.
 */
export function drag(list: string[], entries: QueueOrderEntry[], key: string, beforeKey: string | null): string[] {
  const pairs = constraints(entries);
  const l = list.filter((k) => k !== key);
  const at = beforeKey === null ? l.length : l.indexOf(beforeKey);
  l.splice(at < 0 ? l.length : at, 0, key);
  const pos = l.indexOf(key);
  const up = closure(key, pairs, true);
  const down = closure(key, pairs, false);
  const lift = l.filter((k, i) => up.has(k) && i > pos);
  const drop = l.filter((k, i) => down.has(k) && i < pos);
  const rest = l.filter((k) => !lift.includes(k) && !drop.includes(k));
  const p = rest.indexOf(key);
  return settle([...rest.slice(0, p), ...lift, key, ...drop, ...rest.slice(p + 1)], entries);
}

/** Move `keys` to the top, in their given order, each as a drag does: its family block comes along. */
export function lift(list: string[], entries: QueueOrderEntry[], keys: string[]): string[] {
  return [...keys].reverse().reduce((l, k) => (l.includes(k) ? drag(l, entries, k, l.find((x) => x !== k) ?? null) : l), list);
}

/**
 * Permission prompts first, in stored order. Then three levels: the chats open right now, the other entries with
 * a chat (a claimed ticket, or a chat with no ticket), the tickets no chat has claimed. The latched entry leads its
 * level. The family rules order entries only inside each level.
 */
export function view(stored: string[], latch: string | null, entries: QueueOrderEntry[]): string[] {
  const byKey = index(entries);
  const perm = stored.filter((k) => byKey.get(k)?.state === 'permission');
  let rest = stored.filter((k) => byKey.has(k) && !perm.includes(k));
  if (latch && rest.includes(latch)) rest = drag(rest, entries, latch, rest.find((k) => k !== latch) ?? null);
  const level = (k: string) => (byKey.get(k)!.open ? 0 : byKey.get(k)!.state === 'unclaimed' ? 2 : 1);
  return [...perm, ...[0, 1, 2].flatMap((n) => rest.filter((k) => level(k) === n))];
}

/** The first entry of the view that needs Noam and is not the shown one. */
export function next(viewKeys: string[], entries: QueueOrderEntry[], current: string | null): string | null {
  const byKey = index(entries);
  return viewKeys.find((k) => k !== current && needsNoam(byKey.get(k)!)) ?? null;
}
