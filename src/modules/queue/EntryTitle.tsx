import type { QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: what an entry is called, the same on the list and the forest. A ticket reads "#n title",
 * the grey "#n" being its GitHub link; a chat reads its name.
 */
export default function EntryTitle({ entry: e, className }: { entry: QueueEntry; className: string }) {
  return (
    <>
      {e.url && (
        <a href={e.url} target="_blank" rel="noreferrer" title={`Ticket #${e.number} on GitHub`}
          className="flex-shrink-0 text-[13px] text-[#9d9d9d] hover:text-[#3794ff]" onClick={(event) => event.stopPropagation()}>
          #{e.number}
        </a>
      )}
      <span className={className}>{e.title}</span>
    </>
  );
}
