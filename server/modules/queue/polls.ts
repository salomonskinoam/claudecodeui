import { restoreOrder } from '@/modules/queue/order-store.js';
import { refreshCursorTabs } from '@/modules/queue/sources/cursor-tabs.js';
import { refreshLive } from '@/modules/queue/sources/live.js';
import { refreshTickets } from '@/modules/queue/sources/tickets.js';
import { noteRecentTranscripts } from '@/modules/queue/sources/transcripts.js';

/** quests priority queue: the polls that keep the sources fresh, started and stopped with the server. */

const timers: NodeJS.Timeout[] = [];

function every(ms: number, label: string, job: () => Promise<void>): void {
  let busy = false;
  const tick = () => {
    if (busy) return; // a pass that overruns the interval is not started again underneath itself
    busy = true;
    job().catch((error: unknown) => console.error(`[Queue] ${label} failed`, { error: String(error) })).finally(() => { busy = false; });
  };
  const timer = setInterval(tick, ms);
  timer.unref?.();
  timers.push(timer);
  tick();
}

export function initializeQueue(): void {
  if (timers.length) return;
  every(15_000, 'tickets', refreshTickets);
  every(2_000, 'live chats', async () => { await refreshLive(); await refreshCursorTabs(); });
  void restoreOrder().catch((error: unknown) => console.error('[Queue] restore failed; the order is not stored until a restart reads the mirror', { error: String(error) }));
  void noteRecentTranscripts().catch((error: unknown) => console.error('[Queue] closing lines failed', { error: String(error) }));
}

export function closeQueue(): void {
  timers.splice(0).forEach((t) => clearInterval(t));
}
