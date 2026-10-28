import { expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import PermissionRequestsBanner from '@/modules/chat/composer/PermissionRequestsBanner';
import type { PendingPermissionRequest } from '@/shared/types';

// quests: a plan that waits for approval shows its own card above the input box, with the two decisions.
it('a plan waiting for approval gets a card with Revise and Build the plan', () => {
  const decide = vi.fn();
  const request = { requestId: 'req-1', toolName: 'ExitPlanMode', input: { plan: 'Step 1' } } as unknown as PendingPermissionRequest;
  render(
    <PermissionRequestsBanner
      pendingPermissionRequests={[request]}
      handlePermissionDecision={decide}
      handleGrantToolPermission={() => {}}
    />,
  );
  expect(screen.getByText('The plan waits for your approval')).toBeTruthy();
  fireEvent.click(screen.getByText('Build the plan'));
  expect(decide).toHaveBeenCalledWith('req-1', { allow: true });
  fireEvent.click(screen.getByText('Revise'));
  expect(decide).toHaveBeenLastCalledWith('req-1', expect.objectContaining({ allow: false }));
});
