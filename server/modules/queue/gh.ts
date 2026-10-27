import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** The tickets repository (GitHub issues of kind quest, sidequest, blocker) and the one way the queue talks to it. */
export const TICKETS_REPO = 'salomonskinoam/tickets';

const run = promisify(execFile);

/** Runs `gh` with `args` and returns its stdout. */
export const gh = async (args: string[], maxBuffer = 16 * 1024 * 1024): Promise<string> =>
  (await run('gh', args, { maxBuffer })).stdout;
