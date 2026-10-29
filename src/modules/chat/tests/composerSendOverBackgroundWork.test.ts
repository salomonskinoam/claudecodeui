import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import { useChatComposerState } from '@/modules/chat/hooks/useChatComposerState';
import type { PermissionMode, Project, ProjectSession, SessionActivityMap } from '@/shared/types';

/**
 * A session whose turn has ended with background work still running keeps
 * its composer usable — but for a provider other than Claude a new turn
 * replaces the CLI process that work runs under, so the work is stopped or
 * finishes where nothing listens. The composer says so and asks before
 * sending. quests: a Claude chat never asks and never queues: its message is
 * pushed into the same process (the server does that), so the work goes on.
 */

const PROJECT: Project = { projectId: 'project-1', displayName: 'Project One', fullPath: '/tmp/project-one' };
const SESSION: ProjectSession = { id: 'session-1' };

const backgroundOnly: SessionActivityMap = new Map([[
  'session-1',
  {
    statusText: null,
    canInterrupt: false,
    startedAt: 1,
    background: true,
    tasks: [
      { taskId: 'w1', toolUseId: 'toolu_wf', taskType: 'local_workflow', description: 'Audit the frontend', workflowName: 'frontend-architecture-audit', startedAt: 1 },
      { taskId: 'b1', toolUseId: 'toolu_inner', taskType: 'local_bash', description: 'Sleep for 60 seconds', startedAt: 2, nested: true },
      { taskId: 'a1', toolUseId: 'toolu_agent', taskType: 'local_agent', description: 'Survey the repo', startedAt: 3 },
    ],
  },
]]);

const submit = async (processingSessions: SessionActivityMap, provider: 'claude' | 'codex' = 'codex', isLoading = false) => {
  const sent: Array<{ type: string }> = [];
  const view = renderHook(() =>
    useChatComposerState({
      selectedProject: PROJECT,
      selectedSession: SESSION,
      currentSessionId: SESSION.id,
      provider,
      permissionMode: 'default',
      cyclePermissionMode: () => undefined,
      resolvePermissionModeForProvider: () => 'default' as PermissionMode,
      currentProviderModel: 'test-model',
      currentProviderEffort: 'medium',
      isLoading,
      processingSessions,
      canAbortSession: false,
      tokenBudget: null,
      sendMessage: (message) => { sent.push(message as { type: string }); },
      scrollToBottom: () => undefined,
      addMessage: () => undefined,
      setIsUserScrolledUp: () => undefined,
      setPendingPermissionRequests: () => undefined,
    }),
  );
  await act(async () => { view.result.current.setInput('hello'); });
  await act(async () => { await view.result.current.handleSubmit({ preventDefault: () => undefined } as never); });
  return { sends: sent.filter((message) => message.type === 'chat.send'), view };
};

const confirm = vi.fn<(message?: string) => boolean>();

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  vi.stubGlobal('confirm', confirm);
  confirm.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test('sending on a session with background work asks first, naming the session\'s own tasks', async () => {
  confirm.mockReturnValue(false);
  const { sends, view } = await submit(backgroundOnly);

  assert.equal(confirm.mock.calls.length, 1);
  assert.equal(
    confirm.mock.calls[0]?.[0],
    'This session still has background work running:\n'
    + '• Workflow frontend-architecture-audit\n'
    + '• Agent Survey the repo\n\n'
    + 'A new message starts a new turn, which stops that work; anything it has not reported yet is lost. Send anyway?',
  );
  assert.equal(sends.length, 0, 'declined: nothing is sent');
  assert.equal(view.result.current.input, 'hello', 'and the draft stays in the composer');
});

test('confirming sends the message', async () => {
  confirm.mockReturnValue(true);
  const { sends } = await submit(backgroundOnly);

  assert.equal(sends.length, 1);
});

test('quests: a Claude chat with background work sends at once, no question', async () => {
  const { sends } = await submit(backgroundOnly, 'claude');

  assert.equal(confirm.mock.calls.length, 0);
  assert.equal(sends.length, 1);
});

test('quests: a Claude chat whose turn is running sends at once instead of queueing', async () => {
  const { sends, view } = await submit(new Map(), 'claude', true);

  assert.equal(sends.length, 1, 'the message goes out and joins the running turn');
  assert.equal(view.result.current.queuedDraft, null, 'nothing is queued');
});

test('a session with nothing in the background sends without asking', async () => {
  const { sends } = await submit(new Map());

  assert.equal(confirm.mock.calls.length, 0);
  assert.equal(sends.length, 1);
});
