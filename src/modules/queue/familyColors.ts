import { useQueue } from '@/modules/queue/queueStore';
import type { Queue } from '@/modules/queue/types';

/**
 * quests priority queue: the family colors. This module alone decides which color a family wears; the list, the
 * forest and the tabs only look a root key up. Three parts, each on its own:
 *   the palette      ten dark colors far apart, each in three shades, darkest first
 *   the rule         assignColors: a pure function, no queue, no browser
 *   the memory       the browser keeps every color given, so a family's color never changes
 * useFamilyColors joins them for the page.
 */

const BASE = ['#1f4e79', '#7a4a10', '#2d5a27', '#6b1f52', '#16585e', '#6b2020', '#5e5e14', '#2a3a8a', '#4b5260', '#4b2a6b'];
const lighten = (hex: string, f: number): string =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f) + 255 * f).toString(16).padStart(2, '0')).join('');
const SHADES = [0, 0.18, 0.36];
export const PALETTE = SHADES.flatMap((f) => BASE.map((c) => lighten(c, f)));
const hueOf = (color: string) => PALETTE.indexOf(color) % BASE.length;
const shadeOf = (color: string) => Math.floor(PALETTE.indexOf(color) / BASE.length);

/** A family as the rule sees it: its key and whether it holds an open chat. */
export type Family = { key: string; open: boolean };

/**
 * The rule. Families already colored keep their color, with one move: when the family wearing a color's darkest
 * shade is gone, the family wearing its next shade takes the darkest shade (a lighter shade is never promoted
 * past a darker one; the hue never changes). The others, in the order given, each take the color worn by the
 * fewest families, an open family weighing as much as a hundred others, so the open chats stay apart and the next
 * families get a lighter shade of a worn color. Returns the colors of every family given.
 */
export function assignColors(families: Family[], given: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map(families.filter((f) => given.has(f.key)).map((f) => [f.key, given.get(f.key) as string]));
  for (let hue = 0; hue < BASE.length; hue += 1) {
    const wearers = [...out].filter(([, c]) => hueOf(c) === hue).sort(([, a], [, b]) => shadeOf(a) - shadeOf(b));
    wearers.forEach(([k], i) => out.set(k, PALETTE[hue + BASE.length * Math.min(i, SHADES.length - 1)]));
  }
  const weight = new Map(families.map((f) => [f.key, f.open ? 100 : 1]));
  for (const f of families) {
    if (out.has(f.key)) continue;
    const worn = (c: string) => [...out].filter(([, v]) => v === c).reduce((n, [k]) => n + (weight.get(k) ?? 1), 0);
    out.set(f.key, PALETTE.reduce((a, b) => (worn(b) < worn(a) ? b : a)));
  }
  return out;
}

/** The memory: every color ever given, in the browser. A family gone and back keeps its color. */
const STORE = 'quests-family-colors';
const recall = (): Map<string, string> => {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(STORE) ?? '{}')));
  } catch {
    return new Map();
  }
};
const remember = (colors: Map<string, string>): void => {
  try {
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries([...recall(), ...colors])));
  } catch {
    /* no storage: the colors hold for this page load only */
  }
};

/** The queue's families, the ones in view first (so open chats pick first), with whether they hold an open chat. */
export function familiesOf(queue: Queue): Family[] {
  const rootOf = new Map(queue.entries.map((e) => [e.key, e.rootKey]));
  const open = new Set(queue.entries.filter((e) => e.group === 0).map((e) => e.rootKey));
  const keys = [...new Set([...queue.view.map((k) => rootOf.get(k)), ...rootOf.values()])].filter((k): k is string => Boolean(k));
  return keys.map((key) => ({ key, open: open.has(key) }));
}

export function useFamilyColors(): Map<string, string> {
  const given = recall();
  const colors = assignColors(familiesOf(useQueue()), given);
  if ([...colors].some(([k, c]) => given.get(k) !== c)) remember(colors);
  return colors;
}
