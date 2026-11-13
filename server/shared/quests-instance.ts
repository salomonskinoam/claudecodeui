import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * quests: which server this process is. N servers run side by side, each one the user unit quests-ui@<instance>,
 * with its environment from ~/.config/quests/user.env (the user's: tickets repo, name, time zone) and then
 * ~/.config/quests/<instance>.env (the server's: port, database, unit prefix, project roots; it may override the
 * tickets repo). The contract: quests/INTERFACE.md. A missing value is an error, never a default.
 */

const CONFIG_DIR = path.join(os.homedir(), '.config', 'quests');

const need = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`quests: ${key} is not set (quests/INTERFACE.md: ~/.config/quests/user.env and <instance>.env)`);
  return v;
};

const rootsOf = (value: string | undefined): string[] => (value ?? '').split(':').filter(Boolean).map((p) => path.resolve(p));

export const ticketsRepo = (): string => need('TICKETS_REPO');
export const questsUser = (): string => need('QUESTS_USER');
export const questsTz = (): string => need('QUESTS_TZ');
/** Units are <prefix>-chat-<id> and <prefix>-listen-<id>; the socket folder and the builds folder carry it too. */
export const unitPrefix = (): string => need('QUESTS_UNIT_PREFIX');

/** The PROJECT_ROOTS of every other instance file: the main server (no roots of its own) shows all but these. */
function otherRoots(): string[] {
  const me = need('QUESTS_INSTANCE');
  return fs.readdirSync(CONFIG_DIR)
    .filter((f) => f.endsWith('.env') && f !== 'user.env' && f !== `${me}.env`)
    .flatMap((f) => rootsOf(fs.readFileSync(path.join(CONFIG_DIR, f), 'utf8').match(/^PROJECT_ROOTS=(.*)$/m)?.[1]));
}

/** A worktree of Claude Code (<repo>/.claude/worktrees/<name>) belongs to its repo. */
export const repoOf = (projectPath: string): string => projectPath.replace(/\/\.claude\/worktrees\/[^/]+$/, '');

const under = (p: string, roots: string[]): boolean => roots.some((r) => p === r || p.startsWith(`${r}/`));

let cache: { own: string[]; others: string[] } | null = null;

/** Whether a chat or project at this path is this server's. An unknown path is the main server's. */
export function servesPath(projectPath: string | null | undefined): boolean {
  cache ??= { own: rootsOf(process.env.PROJECT_ROOTS), others: otherRoots() };
  if (cache.own.length) return !!projectPath && under(repoOf(projectPath), cache.own);
  return !projectPath || !under(repoOf(projectPath), cache.others);
}
