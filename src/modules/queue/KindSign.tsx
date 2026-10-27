import { Flag, GitBranch } from 'lucide-react';

import type { QueueKind } from '@/modules/queue/types';

/**
 * quests priority queue: the sign of an entry's kind, the same on the list, the forest and the tabs.
 *   blocker    a red "no entry" sign (a red disc with a white bar)
 *   quest      a flag
 *   sidequest  a branch, since it branches off its parent
 *   chat       no sign, but the sign's slot, so every name starts at the same place
 */
export default function KindSign({ kind }: { kind: QueueKind }) {
  if (kind === 'blocker') {
    return (
      <span title="Blocker" className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full bg-[#e5302f]">
        <span className="h-[2px] w-[7px] bg-white" />
      </span>
    );
  }
  if (kind === 'quest') return <span title="Quest" className="flex flex-shrink-0"><Flag className="h-3 w-3 text-[#e2c08d]" /></span>;
  if (kind === 'sidequest') return <span title="Side quest" className="flex flex-shrink-0"><GitBranch className="h-3 w-3 text-[#89d185]" /></span>;
  return <span className="w-3 flex-shrink-0" />;
}
