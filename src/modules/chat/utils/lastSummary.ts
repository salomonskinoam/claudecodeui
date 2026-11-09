import type { ChatMessage } from '@/shared/types';

const SUMMARY_LINE = /^\s*\*\*Summary:?\*\*:?\s*$/;
const CLOSING_LINE = /^\s*\**running\b/i;

/** The Summary of the chat's last reply that has one, from its "**Summary**" line to the end; else the closing
 *  lines of the last reply; else null. */
export function lastSummary(chatMessages: ChatMessage[]): string | null {
  const replies = chatMessages.filter((m) => m.type === 'assistant' && !m.isToolUse && typeof m.content === 'string' && m.content.trim());
  for (let i = replies.length - 1; i >= 0; i -= 1) {
    const lines = (replies[i].content as string).split('\n');
    const start = lines.findIndex((l) => SUMMARY_LINE.test(l));
    if (start >= 0) return lines.slice(start + 1).join('\n').trim();
  }
  const last = replies.at(-1)?.content?.split('\n') ?? [];
  const closing = last.findIndex((l) => CLOSING_LINE.test(l));
  return closing >= 0 ? last.slice(closing).join('\n').trim() : null;
}
