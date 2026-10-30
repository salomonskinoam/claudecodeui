import assert from 'node:assert/strict';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { test, vi } from 'vitest';

import '@/modules/i18n';
import ActivityIndicator from '@/modules/chat/composer/ActivityIndicator';
import type { BackgroundTaskSummary, SessionActivity } from '@/shared/types';

/**
 * The pill above the composer used to vanish at the turn's `complete` even
 * when the CLI stayed open for the agents, workflows or commands the turn
 * launched. A background-only entry now keeps it up, named for the work and
 * in the purple of the workflow and agent cards — with no Stop, because
 * nothing is responding and the composer can send.
 */

const task = (overrides: Partial<BackgroundTaskSummary> = {}): BackgroundTaskSummary => ({
  taskId: 'wxkj4kcvd',
  toolUseId: 'toolu_workflow_1',
  taskType: 'local_workflow',
  description: 'Audit the frontend',
  workflowName: 'frontend-architecture-audit',
  startedAt: Date.now() - 65_000,
  ...overrides,
});

const backgroundActivity = (tasks: BackgroundTaskSummary[]): SessionActivity => ({
  statusText: null,
  canInterrupt: false,
  startedAt: Math.min(...tasks.map((entry) => entry.startedAt)),
  background: true,
  tasks,
});

test('quests: a background-only session draws nothing here: the workers panel shows its work (requirement 40)', () => {
  const { container } = render(<ActivityIndicator activity={backgroundActivity([task()])} onAbort={vi.fn()} />);
  assert.equal(container.textContent, '');
  assert.equal(screen.queryByRole('button', { name: 'Stop' }), null);
});

test('a response in flight still shows the Stop button and the primary dot', () => {
  const onAbort = vi.fn();
  const { container } = render(
    <ActivityIndicator activity={{ statusText: null, canInterrupt: true, startedAt: Date.now() - 3_000 }} onAbort={onAbort} />,
  );
  assert.ok(screen.getByRole('button', { name: 'Stop' }));
  assert.ok(container.querySelector('.bg-primary'));
});
