import { Router } from 'express';
import { getDb } from '../services/db.js';
import { getTimeline } from '../services/diffService.js';
import { requireAuth } from '../middleware/auth.js';

const attempt = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

export function createTimelineRouter(database = getDb) {
  const router = Router();
  const db = () => typeof database === 'function' ? database() : database;

  router.use(requireAuth);

  router.get('/:id/timeline', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) return res.status(404).json({ error: { message: 'Topic not found.' } });
    if (topic.userId !== req.user.id) return res.status(403).json({ error: { message: 'You do not own this topic.' } });

    const options = {};
    if (req.query?.limit !== undefined) options.limit = req.query.limit;
    if (req.query?.offset !== undefined) options.offset = req.query.offset;

    res.json({ topic, diffs: await getTimeline(topic.id, client, options) });
  }));

  router.get('/:id/snapshots/latest', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) return res.status(404).json({ error: { message: 'Topic not found.' } });
    if (topic.userId !== req.user.id) return res.status(403).json({ error: { message: 'You do not own this topic.' } });
    const snapshot = await client.snapshot.findFirst({ where: { topicId: topic.id }, orderBy: { pulledAt: 'desc' } });
    res.json({ snapshot });
  }));

  router.get('/:id/snapshots', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) return res.status(404).json({ error: { message: 'Topic not found.' } });
    if (topic.userId !== req.user.id) return res.status(403).json({ error: { message: 'You do not own this topic.' } });

    const limit = Math.min(Math.max(1, Number(req.query?.limit) || 20), 50);
    const offset = Math.max(0, Number(req.query?.offset) || 0);
    const snapshots = typeof client.snapshot?.findMany === 'function'
      ? await client.snapshot.findMany({ where: { topicId: topic.id }, orderBy: { pulledAt: 'desc' }, take: limit, skip: offset })
      : [];
    res.json({ snapshots });
  }));

  return router;
}

export default createTimelineRouter;
