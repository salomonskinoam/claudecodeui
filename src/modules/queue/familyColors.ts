import { useQueue } from '@/modules/queue/queueStore';
import type { Queue } from '@/modules/queue/types';

/**
 * quests priority queue: one color per family, the same on the list, the forest and the tabs, and STATIC: a family
 * keeps the color it got for good (kept in the browser), whatever moves or arrives. Ten dark colors far apart, each
 * in three shades; a new family takes the color worn by the fewest families, an open family (group 0) weighing as
 * much as a hundred others, so the open chats stay apart and the next families get a lighter shade of a worn color.
 */
const BASE = ['#1f4e79', '#7a4a10', '#2d5a27', '#6b1f52', '#16585e', '#6b2020', '#5e5e14', '#2a3a8a', '#4b5260', '#4b2a6b'];
const lighten = (hex: string, f: number): string =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f) + 255 * f).toString(16).padStart(2, '0')).join('');
/** The ten colors, then the same ten 18% lighter, then 36% lighter: thirty, the darkest shades taken first. */
const PALETTE = [0, 0.18, 0.36].flatMap((f) => BASE.map((c) => lighten(c, f)));
const STORE = 'quests-family-colors';

const readSaved = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
};

export function familyColors(queue: Queue, saved: Record<string, string> = readSaved()): Map<string, string> {
  const rootOf = new Map(queue.entries.map((e) => [e.key, e.rootKey]));
  const open = new Set(queue.entries.filter((e) => e.group === 0).map((e) => e.rootKey));
  const roots = [...new Set([...queue.view.map((k) => rootOf.get(k)), ...rootOf.values()])].filter((r): r is string => Boolean(r));
  const out = new Map(roots.filter((r) => saved[r]).map((r) => [r, saved[r]]));
  const fresh = roots.filter((r) => !out.has(r)); // in view order, so the open ones pick first
  for (const root of fresh) {
    const worn = (c: string) => [...out].filter(([, v]) => v === c).reduce((n, [r]) => n + (open.has(r) ? 100 : 1), 0);
    out.set(root, PALETTE.reduce((a, b) => (worn(b) < worn(a) ? b : a)));
  }
  if (fresh.length) {
    // ponytail: gone families keep their row forever (a chat that comes back keeps its color); the store stays small
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...saved, ...Object.fromEntries(out) }));
    } catch {
      /* no storage: colors hold for this page load only */
    }
  }
  return out;
}

export const useFamilyColors = (): Map<string, string> => familyColors(useQueue());
