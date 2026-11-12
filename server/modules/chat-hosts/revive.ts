import express from 'express';
import type { Request, Response } from 'express';

import { logEvent } from '@/modules/events/index.js';
import { getQueue } from '@/modules/queue/index.js';
import { asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

import { sendToChat } from './hosts.js';

/**
 * quests (requirement 123): "Revive from crash", a button Noam presses by hand after a crash. It sends one message
 * to every chat that should be alive but is not: in the queue, its last line says it waits for something (or is
 * blocked), and no process and no listener of it runs. A chat open in Cursor is listed, not sent to: a second
 * process on its transcript would break it. Noam, 12 Nov: "there should be a MANUAL \"revive from crash\" button
 * under recolor and it needs a \"are you sure, this will message <> to all chats\" popup" and "the send is to all
 * \"alive\" chats that are actually not alive".
 */

export const REVIVE_TEXT = 'i think you were doing something that died with the computer dying, so continue if you were or say "done" if we\'re all done';

type Candidate = {
  sessionId: string | null; title: string; placement: string; state: string; live: boolean;
  marks: string[]; heldOutside: boolean;
};

/** The dead chats: `send` gets the message, `outside` are open in Cursor and only listed. */
export function deadChats(entries: Candidate[]): { send: Candidate[]; outside: Candidate[] } {
  const dead = entries.filter((e) => e.sessionId && e.placement === 'queue'
    && (e.state === 'waiting' || e.state === 'blocker') && !e.live
    && !e.marks.includes('listener') && !e.marks.includes('listenerSilent'));
  return { send: dead.filter((e) => !e.heldOutside), outside: dead.filter((e) => e.heldOutside) };
}

const view = () => {
  const { send, outside } = deadChats(getQueue().entries);
  return { text: REVIVE_TEXT, send: send.map((e) => ({ sessionId: e.sessionId, title: e.title })), outside: outside.map((e) => e.title) };
};

const router = express.Router();

// What the button would do: the message and the chats it goes to, for the "are you sure" popup.
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(createApiSuccessResponse(view()));
}));

// Noam said yes: the message goes to the chats that are dead now (read again, not the popup's list).
router.post('/', asyncHandler(async (_req: Request, res: Response) => {
  const v = view();
  for (const c of v.send) {
    logEvent('server', 'revive.sent', c.sessionId, { title: c.title });
    await sendToChat(c.sessionId as string, REVIVE_TEXT);
  }
  res.json(createApiSuccessResponse(v));
}));

export const reviveRoutes = router;
