import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * quests priority queue: one collapsed group in the list ("Live chats (7)", "Tickets-Unclaimed (14)"): a line
 * with the count, collapsed by default, that opens to its members on a click.
 */
export default function QueueGroupLine({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-quests-group={label}
      className="mx-1 mt-[7px] flex h-[26px] w-auto cursor-pointer items-center gap-2 rounded-sm px-2 text-[14px] text-[#9d9d9d] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
      onClick={onToggle}
    >
      {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {label} ({count})
    </button>
  );
}
