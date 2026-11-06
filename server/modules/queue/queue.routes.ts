import express from 'express';
import type { Request, Response } from 'express';

import { claimFromPage, dragTo, settleChat, getQueue, placeEntry, replaceTicketGroups, reportPageTabs, setLatch, setOrder, syncFromCursor } from '@/modules/queue/queue.service.js';
import { closeTicket, getTickets, type CloseChoice } from '@/modules/queue/sources/tickets.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

/** quests priority queue: the HTTP surface, mounted at /api/quests/queue. Every answer is the whole queue. */

const bad = (message: string) => new AppError(message, { code: 'INVALID_REQUEST_BODY', statusCode: 400 });
const CHOICES = new Set(['close', 'blockers-to-quest', 'blockers-to-sidequest', 'close-blockers']);
const keys = (v: unknown): v is string[] => Array.isArray(v) && v.every((k) => typeof k === 'string');

const router = express.Router();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(createApiSuccessResponse(getQueue()));
}));

// Each page window reports the chats open as its tabs (its own session ids, in tab order): they join the queue.
router.put('/tabs', asyncHandler(async (req: Request, res: Response) => {
  const { windowId, sessionIds } = req.body ?? {};
  if (typeof windowId !== 'string' || !keys(sessionIds)) throw bad('windowId and a list of sessionIds are required.');
  res.json(createApiSuccessResponse(reportPageTabs(windowId, sessionIds)));
}));

router.put('/order', asyncHandler(async (req: Request, res: Response) => {
  const { order } = req.body ?? {};
  if (!keys(order)) throw bad('order must be a list of keys.');
  res.json(createApiSuccessResponse(setOrder(order)));
}));

router.put('/drag', asyncHandler(async (req: Request, res: Response) => {
  const { key, beforeKey } = req.body ?? {};
  if (typeof key !== 'string' || !(beforeKey === null || typeof beforeKey === 'string')) throw bad('key and beforeKey are required.');
  res.json(createApiSuccessResponse(dragTo(key, beforeKey)));
}));

router.put('/latch', asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.body ?? {};
  if (!(key === null || typeof key === 'string')) throw bad('key must be a key or null.');
  res.json(createApiSuccessResponse(setLatch(key)));
}));

// A drawer button: the entry goes to the queue (at its end), "On hold" or "Archived".
const PLACES = new Set(['queue', 'hold', 'archive']);
router.put('/place', asyncHandler(async (req: Request, res: Response) => {
  const { key, where } = req.body ?? {};
  if (typeof key !== 'string' || !PLACES.has(where)) throw bad('key and where (queue, hold or archive) are required.');
  res.json(createApiSuccessResponse(placeEntry(key, where)));
}));

// Noam's groups of unclaimed tickets: the whole list replaces the stored one.
router.put('/groups', asyncHandler(async (req: Request, res: Response) => {
  res.json(createApiSuccessResponse(replaceTicketGroups(req.body?.groups)));
}));

// The ticket page: one open ticket's title, labels and text (Noam, 3 Nov: "i want to see the ticket body in the
// chat window for reading").
router.get('/ticket/:number', asyncHandler(async (req: Request, res: Response) => {
  const number = Number(req.params.number);
  const t = getTickets().find((x) => x.number === number);
  if (!t) throw new AppError(`No open ticket #${req.params.number}.`, { code: 'QUEUE_TICKET_NOT_FOUND', statusCode: 404 });
  res.json(createApiSuccessResponse({ number: t.number, title: t.title, url: t.url, labels: t.labels, body: t.body, createdAt: t.createdAt }));
}));

// A chat started from a ticket's tab (its page session id): the ticket's line and the chat become one at once.
router.post('/claim', asyncHandler(async (req: Request, res: Response) => {
  const { number, sessionId } = req.body ?? {};
  if (!Number.isInteger(number) || typeof sessionId !== 'string' || !sessionId) throw bad('number and sessionId are required.');
  res.json(createApiSuccessResponse(claimFromPage(number, sessionId)));
}));
// A chat's turn just ended: the queue is read again for it at once (the page's finish sound waits for this).
router.post('/settle', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.body ?? {};
  if (typeof sessionId !== 'string' || !sessionId) throw bad('sessionId is required.');
  res.json(createApiSuccessResponse(await settleChat(sessionId)));
}));
router.post('/sync-cursor', asyncHandler(async (_req: Request, res: Response) => {
  res.json(createApiSuccessResponse(syncFromCursor()));
}));

router.post('/close', asyncHandler(async (req: Request, res: Response) => {
  const { number, choice } = req.body ?? {};
  if (!Number.isInteger(number) || typeof choice !== 'string' || !(CHOICES.has(choice) || /^kind:[\w-]+$/.test(choice))) {
    throw bad('number and a known choice are required.');
  }
  await closeTicket(number, choice as CloseChoice);
  res.json(createApiSuccessResponse(getQueue()));
}));

export default router;
