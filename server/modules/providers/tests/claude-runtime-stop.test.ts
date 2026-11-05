import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import { CLAUDE_PREDEFINED_MODELS } from '@/modules/providers/list/claude/claude-models.provider.js';
import { abortClaudeSDKSession, queryClaudeSDK } from '@/modules/providers/list/claude/claude-runtime.provider.js';
import type { ProviderRuntimeContext } from '@/shared/types.js';

/**
 * quests: Stop while the CLI is still starting ends the process at once. The stand-in CLI never answers its
 * interrupt (as a CLI that is not up yet), and ends only when its abortController fires, as the SDK's does.
 */
async function run(answerFirst: boolean) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'claude-runtime-stop-'));
  let interrupted = 0;
  let signal: AbortSignal | undefined;
  const createQuery: NonNullable<ProviderRuntimeContext['createQuery']> = ({ options }) => {
    signal = (options as { abortController?: AbortController }).abortController?.signal;
    const iterator = (async function* () {
      if (answerFirst) yield { type: 'system', subtype: 'init', session_id: 'native-stop' };
      await new Promise<void>((resolve) => {
        if (signal?.aborted) resolve();
        signal?.addEventListener('abort', () => resolve());
      });
      throw new Error('aborted');
    })();
    return Object.assign(iterator, {
      interrupt: () => {
        interrupted += 1;
        // An interrupt the CLI answers ends the turn the same way.
        (options as { abortController: AbortController }).abortController.abort();
        return answerFirst ? Promise.resolve() : new Promise<void>(() => {});
      },
      stopTask: async () => {},
    });
  };
  const sessions = new ClaudeSessionsProvider({ getLiveRunStartTime: () => null });
  const context: ProviderRuntimeContext = {
    resolveProviderSessionId: () => null,
    resolveResumeModel: async () => undefined,
    getProviderModels: async () => CLAUDE_PREDEFINED_MODELS as never,
    normalizeMessage: (raw, sessionId) => sessions.normalizeMessage(raw, sessionId),
    isProviderInstalled: async () => true,
    createQuery,
  };
  const writer = { send: () => undefined, userId: null };
  try {
    const done = queryClaudeSDK('hello', { sessionId: `app-stop-${answerFirst}`, cwd }, writer as never, context);
    await new Promise((resolve) => { setTimeout(resolve, 25); });
    const stopped = await Promise.race([
      abortClaudeSDKSession(`app-stop-${answerFirst}`),
      new Promise((resolve) => { setTimeout(() => resolve('hung'), 1000); }),
    ]);
    await done;
    return { stopped, interrupted, aborted: Boolean(signal?.aborted) };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test('Stop on a CLI that has not answered yet ends the process without waiting for an interrupt', async () => {
  assert.deepEqual(await run(false), { stopped: true, interrupted: 0, aborted: true });
});

test('Stop on a CLI that has answered interrupts the turn', async () => {
  assert.deepEqual(await run(true), { stopped: true, interrupted: 1, aborted: true });
});
