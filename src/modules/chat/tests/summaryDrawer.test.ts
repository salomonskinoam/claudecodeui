import { describe, expect, it } from 'vitest';

import { lastSummary } from '@/modules/chat/utils/lastSummary';
import type { ChatMessage } from '@/shared/types';

const reply = (content: string): ChatMessage => ({ type: 'assistant', content, timestamp: 0 });

describe('lastSummary', () => {
  it('takes the last reply with a Summary line, from that line on, even when newer progress follows', () => {
    const summary = '**Summary**\n\n- **5.** "fix it". Done.\n\n**Running:** nothing';
    expect(lastSummary([reply('old'), reply(summary), { type: 'user', content: 'next', timestamp: 0 }, reply('working on it')]))
      .toBe('- **5.** "fix it". Done.\n\n**Running:** nothing');
  });

  it('falls back to the closing lines of the last reply, then to null', () => {
    expect(lastSummary([reply('Fixed.\n\n**Running:** nothing\n\nDone it')])).toBe('**Running:** nothing\n\nDone it');
    expect(lastSummary([reply('just text')])).toBeNull();
    expect(lastSummary([])).toBeNull();
  });
});
