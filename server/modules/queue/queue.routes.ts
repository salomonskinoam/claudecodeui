import express from 'express';
import type { Request, Response } from 'express';

import {
  closeTicket, dragTo, getQueue, previewDrag, setLatch, setOpenTabs, setOrder, type CloseChoice,
} from '@/modules/queue/services/queue.service.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

const bad = (message: string) => new AppError(message, { code: 'INVALID_REQUEST_BODY', statusCode: 400 });
const CHOICES = new Set(['close', 'blockers-to-quest', 'blockers-to-sidequest', 'close-blockers']);

const router = express.Router();

// The page reports the chats open as its tabs (its own session ids, in tab order): they rank at the top.
router.put('/tabs', asyncHandler(async (req: Request, res: Response) => {
  const { sessionIds } = req.body ?? {};
  if (!Array.isArray(sessionIds) || !sessionIds.every((k) => typeof k === 'string')) throw bad('sessionIds must be a list.');
  setOpenTabs(sessionIds);
  res.json(createApiSuccessResponse(getQueue()));
}));

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(createApiSuccessResponse(getQueue()));
}));

router.put('/order', asyncHandler(async (req: Request, res: Response) => {
  const { order } = req.body ?? {};
  if (!Array.isArray(order) || !order.every((k) => typeof k === 'string')) throw bad('order must be a list of keys.');
  res.json(createApiSuccessResponse(setOrder(order)));
}));

router.put('/drag', asyncHandler(async (req: Request, res: Response) => {
  const { key, beforeKey } = req.body ?? {};
  if (typeof key !== 'string' || !(beforeKey === null || typeof beforeKey === 'string')) throw bad('key and beforeKey are required.');
  res.json(createApiSuccessResponse(dragTo(key, beforeKey)));
}));

router.get('/preview', asyncHandler(async (req: Request, res: Response) => {
  const { key, before } = req.query;
  if (typeof key !== 'string') throw bad('key is required.');
  res.json(createApiSuccessResponse({ view: previewDrag(key, typeof before === 'string' && before ? before : null) }));
}));

router.put('/latch', asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.body ?? {};
  if (!(key === null || typeof key === 'string')) throw bad('key must be a key or null.');
  res.json(createApiSuccessResponse(setLatch(key)));
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
