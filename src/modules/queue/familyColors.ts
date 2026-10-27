import { useQueue } from '@/modules/queue/queueStore';
import type { Queue } from '@/modules/queue/types';

/**
 * quests priority queue: one color per family, the same on the list, the forest and the tabs. Ten dark colors far
 * apart. Families are colored in queue order, each with the color longest unused that no neighbor of any of its
 * lines already wears, so two lines next to each other in the list never share a color.
 */
const PALETTE = ['#1f4e79', '#7a4a10', '#2d5a27', '#6b1f52', '#16585e', '#6b2020', '#5e5e14', '#2a3a8a', '#4b5260', '#4b2a6b'];

export function familyColors(queue: Queue): Map<string, string> {
  const rootOf = new Map(queue.entries.map((e) => [e.key, e.rootKey]));
  const lines = queue.view.map((k) => rootOf.get(k)).filter((r): r is string => Boolean(r));
  const at = new Map<string, number[]>();
  lines.forEach((r, i) => at.set(r, [...(at.get(r) ?? []), i]));
  const out = new Map<string, string>();
  const used: string[] = []; // the colors given so far, the longest unused first
  for (const root of [...lines, ...rootOf.values()]) {
    if (out.has(root)) continue;
    const beside = new Set((at.get(root) ?? []).flatMap((i) => [lines[i - 1], lines[i + 1]]).map((r) => r && out.get(r)));
    const color = [...PALETTE.filter((c) => !used.includes(c)), ...used].find((c) => !beside.has(c)) ?? used[0];
    used.splice(used.indexOf(color), used.includes(color) ? 1 : 0);
    used.push(color);
    out.set(root, color);
  }
  return out;
}

export const useFamilyColors = (): Map<string, string> => familyColors(useQueue());
