import { promises as fsp } from 'node:fs';

/**
 * quests: the work tabs' server side for backgrounded commands. Claude Code writes a backgrounded command's output
 * to /tmp/claude-<uid>/<cwd as a folder name>/<session id>/tasks/<task id>.output and names that file in the
 * tool result (`<output-file>`); a watcher (the Monitor tool) tails a log a chat keeps under /tmp/claude-<its
 * id>/. Only a file under a /tmp/claude-* folder is served, and only its tail.
 */

export const TASK_OUTPUT_FILE = /^\/tmp\/claude-[A-Za-z0-9_-]+\/(?!(?:.*\/)?\.\.(?:\/|$))[^\0]+$/;
export const isTaskOutputFile = (file: string): boolean => TASK_OUTPUT_FILE.test(file);

const TAIL_BYTES = 256 * 1024;

export type OutputTail = { text: string; size: number; modifiedAt: number; truncated: boolean };

/** The last 256 KB of the file, as it stands now. */
export async function readOutputTail(file: string): Promise<OutputTail> {
  const handle = await fsp.open(file, 'r');
  try {
    const { size, mtimeMs } = await handle.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return { text: buffer.toString('utf8'), size, modifiedAt: mtimeMs, truncated: start > 0 };
  } finally {
    await handle.close();
  }
}
