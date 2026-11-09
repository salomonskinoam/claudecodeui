import { CHAT_DOT_STYLE, type ChatDot } from '@/shared/hooks/useLiveChats';
import { cn } from '@/shared/utils';

/**
 * quests: a chat's status dot, the same on the tabs, the queue and the sidebar. A dot with a glyph ("?" a silent
 * listener, "!" may be hung) is drawn at 12 px so the glyph can be read; `className` sizes the plain dot.
 */
export default function ChatDotMark({ dot, className }: { dot: ChatDot; className: string }) {
  const s = CHAT_DOT_STYLE[dot];
  return (
    <span
      role="status"
      title={s.label}
      aria-label={s.label}
      className={cn('flex flex-shrink-0 items-center justify-center rounded-full font-bold leading-none text-white', s.glyph ? 'h-3 w-3 text-[9px]' : className, s.pulse && 'animate-pulse')}
      style={{ backgroundColor: s.color }}
    >
      {s.glyph}
    </span>
  );
}
