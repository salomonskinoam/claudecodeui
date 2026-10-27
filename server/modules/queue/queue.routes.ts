import express from 'express';
import type { Request, Response } from 'express';

import { dragTo, getQueue, setLatch, setOrder, syncFromCursor } from '@/modules/queue/queue.service.js';
import { setPageTabs } from '@/modules/queue/sources/page-tabs.js';
import { closeTicket, type CloseChoice } from '@/modules/queue/sources/tickets.js';
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
  setPageTabs(windowId, sessionIds);
  res.json(createApiSuccessResponse(getQueue()));
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
