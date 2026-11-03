import assert from 'node:assert/strict';

import { test } from 'vitest';

import { buildSessionMessagesUrl } from '@/modules/chat/utils/sessionMessagePagination';

test('automatic latest-history URL is explicitly bounded to the newest page', () => {
  assert.equal(
    buildSessionMessagesUrl('session/1', { limit: 20, offset: 0 }),
    '/api/providers/sessions/session%2F1/messages?limit=20&offset=0',
  );
});
