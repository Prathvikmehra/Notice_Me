import { Router } from 'express';
import { getDb } from '../services/db.js';
import { getTimeline } from '../services/diffService.js';

const attempt = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

export function createTimelineRouter(database = getDb) {
  const router = Router();
  const db = () => typeof database === 'function' ? database() : database;

  router.get('/:id/timeline', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) return res.status(404).json({ error: { message: 'Topic not found.' } });
    res.json({ topic, diffs: await getTimeline(topic.id, client) });
  }));

  router.get('/:id/snapshots/latest', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) return res.status(404).json({ error: { message: 'Topic not found.' } });
    const snapshot = await client.snapshot.findFirst({ where: { topicId: topic.id }, orderBy: { pulledAt: 'desc' } });
    res.json({ snapshot });
  }));

  return router;
}

export default createTimelineRouter;
