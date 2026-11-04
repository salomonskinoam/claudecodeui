import { expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import '@/modules/i18n';
import PermissionRequestsBanner from '@/modules/chat/composer/PermissionRequestsBanner';
import type { PendingPermissionRequest } from '@/shared/types';

// quests: a plan that waits for approval shows its own card above the input box, with the plan and the two decisions.
it('a plan waiting for approval gets a card with the plan, Revise and Build the plan', async () => {
  const decide = vi.fn();
  const request = { requestId: 'req-1', toolName: 'ExitPlanMode', input: { plan: 'Step 1' } } as unknown as PendingPermissionRequest;
  render(
    <PermissionRequestsBanner
      pendingPermissionRequests={[request]}
      handlePermissionDecision={decide}
      handleGrantToolPermission={() => ({ success: true })}
    />,
  );
  expect(screen.getByText('The plan waits for your approval')).toBeTruthy();
  expect(screen.getByText('Step 1')).toBeTruthy();
  // Revise needs what should change (or an edit), so the chat knows what to revise.
  expect((screen.getByText('Revise') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByPlaceholderText('What should change? (for Revise)'), { target: { value: 'add a test step' } });
  fireEvent.click(screen.getByText('Revise'));
  await waitFor(() => expect(decide).toHaveBeenLastCalledWith('req-1', expect.objectContaining({ allow: false, message: expect.stringContaining('add a test step') })));
  fireEvent.click(screen.getByText('Build the plan'));
  await waitFor(() => expect(decide).toHaveBeenLastCalledWith('req-1', { allow: true, mode: 'auto' }));
});

it('an edited plan is handed to the chat as the plan when it is built', async () => {
  const decide = vi.fn();
  const request = { requestId: 'req-2', toolName: 'ExitPlanMode', input: { plan: 'Step 1' } } as unknown as PendingPermissionRequest;
  render(
    <PermissionRequestsBanner
      pendingPermissionRequests={[request]}
      handlePermissionDecision={decide}
      handleGrantToolPermission={() => ({ success: true })}
    />,
  );
  fireEvent.click(screen.getByText('Edit the plan'));
  fireEvent.change(screen.getByDisplayValue('Step 1'), { target: { value: 'Step 1\nStep 2' } });
  fireEvent.click(screen.getByText('Build the plan'));
  await waitFor(() => expect(decide).toHaveBeenLastCalledWith('req-2', { allow: true, mode: 'auto', updatedInput: { plan: 'Step 1\nStep 2' } }));
});
