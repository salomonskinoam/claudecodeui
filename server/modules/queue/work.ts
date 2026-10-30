import { existsSync, promises as fsp, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

/**
 * Where Claude Code writes a task's output: /tmp/claude-<uid>/<the process cwd as a folder name>/<provider
 * session id>/tasks/<task id>.output, every task (a backgrounded command, a watcher, an agent). The cwd folder
 * is not known here, so the folders under /tmp/claude-<uid> are searched. Null when no such file exists.
 */
export function findTaskOutputFile(providerSessionId: string, taskId: string): string | null {
  if (!/^[0-9a-f-]{36}$/.test(providerSessionId) || !/^[A-Za-z0-9_-]+$/.test(taskId)) return null;
  const root = path.join(os.tmpdir(), `claude-${os.userInfo().uid}`);
  let folders: string[];
  try {
    folders = readdirSync(root);
  } catch {
    return null;
  }
  for (const folder of folders) {
    const file = path.join(root, folder, providerSessionId, 'tasks', `${taskId}.output`);
    if (existsSync(file)) return file;
  }
  return null;
}

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
