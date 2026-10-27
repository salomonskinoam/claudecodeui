import { TICKETS_REPO, gh } from '@/modules/queue/gh.js';

/**
 * quests priority queue: the order's backup, one file on a branch of the tickets repository, written 10 seconds
 * after the last change and read back when the local database holds no order (a fresh machine, a lost disk).
 */

const PATH = 'queue/order.json';
const BRANCH = 'queue-state';
const DELAY_MS = 10_000;

export type MirrorState = { order: string[]; latch: string | null };

let timer: NodeJS.Timeout | null = null;
// One write at a time: two at once would PUT with the same file sha and the second would be refused. A write
// queued behind another reads the state when it starts, so the last one always carries the newest order.
let chain: Promise<void> = Promise.resolve();

async function write(read: () => MirrorState): Promise<void> {
  const body = JSON.stringify({ ...read(), updatedAt: new Date().toISOString() }, null, 1);
  const branch = await gh(['api', `repos/${TICKETS_REPO}/git/ref/heads/${BRANCH}`]).catch(() => null);
  if (!branch) {
    const main = await gh(['api', `repos/${TICKETS_REPO}/git/ref/heads/main`, '--jq', '.object.sha']);
    await gh(['api', '-X', 'POST', `repos/${TICKETS_REPO}/git/refs`, '-f', `ref=refs/heads/${BRANCH}`, '-f', `sha=${main.trim()}`]);
  }
  const sha = (await gh(['api', `repos/${TICKETS_REPO}/contents/${PATH}?ref=${BRANCH}`, '--jq', '.sha']).catch(() => '')).trim();
  await gh(['api', '-X', 'PUT', `repos/${TICKETS_REPO}/contents/${PATH}`, '-f', 'message=queue order',
    '-f', `content=${Buffer.from(body).toString('base64')}`, '-f', `branch=${BRANCH}`, ...(sha ? ['-f', `sha=${sha}`] : [])]);
}

/** Writes the state `read` gives, 10 seconds from now (a later call restarts the wait). */
export function scheduleMirror(read: () => MirrorState): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    chain = chain.then(() => write(read)).catch((error: unknown) => console.error('[Queue] mirror failed', { error: String(error) }));
  }, DELAY_MS);
  timer.unref?.();
}

/** The saved state, or null when no mirror exists yet. */
export async function readMirror(): Promise<MirrorState | null> {
  const content = await gh(['api', `repos/${TICKETS_REPO}/contents/${PATH}?ref=${BRANCH}`, '--jq', '.content']).catch(() => null);
  if (!content) return null;
  const saved = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
  return { order: saved.order ?? [], latch: saved.latch ?? null };
}
