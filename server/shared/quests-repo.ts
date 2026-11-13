import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { repoOf } from '@/shared/quests-instance.js';

/**
 * quests: the repo side of the interface, <repo>/quests.json (quests/INTERFACE.md). "areas" is a command that prints
 * the repo's areas, one per line (the second word of a chat name, a ticket's area label); "drawer_question" is the
 * Summary drawer's first question. A repo without quests.json has not turned quests on: it has no manifest.
 */
export type QuestsManifest = { areas: string; finish: string; finish_command: string; drawer_question: string };

export function manifestOf(projectPath: string): QuestsManifest | null {
  const file = path.join(repoOf(projectPath), 'quests.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as QuestsManifest : null;
}

const AREAS_TTL_MS = 60_000;
const areasCache = new Map<string, { at: number; areas: string[] }>();

/** The repo's areas, from its "areas" command run at the repo root; a minute old at most. */
export function areasOf(projectPath: string): string[] {
  const repo = repoOf(projectPath);
  const hit = areasCache.get(repo);
  if (hit && Date.now() - hit.at < AREAS_TTL_MS) return hit.areas;
  const m = manifestOf(repo);
  const areas = m ? execSync(m.areas, { cwd: repo, encoding: 'utf8', timeout: 10_000 }).split('\n').map((l) => l.trim()).filter(Boolean) : [];
  areasCache.set(repo, { at: Date.now(), areas });
  return areas;
}
