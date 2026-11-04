import { expect, test } from 'vitest';

import { isChatUnseen, markUnseenOnceHidden, setChatsInView } from '@/shared/hooks/useLiveChats';

test('"Back" makes the chat "Next" opened unseen again, only once it is off screen', () => {
  setChatsInView(['to']);
  markUnseenOnceHidden('to');
  expect(isChatUnseen('to')).toBe(false);
  setChatsInView(['from']);
  expect(isChatUnseen('to')).toBe(true);
  setChatsInView(['to']);
  expect(isChatUnseen('to')).toBe(false);
  setChatsInView(['from']);
  expect(isChatUnseen('to')).toBe(false);
});
