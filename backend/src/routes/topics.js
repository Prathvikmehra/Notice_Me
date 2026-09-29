import { Router } from 'express';
import { getDb } from '../services/db.js';
import { isAlertConfigured } from '../services/alertService.js';
import { syncTopic } from '../services/topicSyncService.js';
import { requireAuth } from '../middleware/auth.js';

const attempt = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const problem = (status, message) => Object.assign(new Error(message), { status });
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = ['scheme', 'exam', 'recruitment', 'case', 'policy', 'admission', 'other'];
const MAX_FREE_TOPICS = 5;

export function createTopicsRouter(database = getDb) {
  const router = Router();
  const db = () => typeof database === 'function' ? database() : database;

  router.use(requireAuth);

  router.get('/', attempt(async (req, res) => {
    const topics = await db().topic.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({ topics });
  }));

  router.get('/search', attempt(async (req, res) => {
    const q = clean(req.query?.q);
    if (!q || q.length < 2) throw problem(400, 'Search query must be at least 2 characters.');
    const [topics, diffs] = await Promise.all([
      db().topic.findMany({
        where: { userId: req.user.id, OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { query: { contains: q, mode: 'insensitive' } },
        ]},
      }),
      db().diff.findMany({
        where: { topic: { userId: req.user.id }, summary: { contains: q, mode: 'insensitive' } },
        include: { topic: { select: { id: true, name: true } } },
        orderBy: { detectedAt: 'desc' },
        take: 20,
      }),
    ]);
    res.json({ topics, diffs });
  }));

  router.post('/', attempt(async (req, res) => {
    const name = clean(req.body?.name);
    const query = clean(req.body?.query);
    const category = req.body?.category == null ? null : clean(req.body.category);
    if (!name || !query || name.length > 120 || query.length > 500) {
      throw problem(400, 'Provide a name (1–120 characters) and query (1–500).');
    }
    if (category && !CATEGORIES.includes(category)) {
      throw problem(400, `Category must be one of: ${CATEGORIES.join(', ')}`);
    }
    if (req.user.plan === 'free') {
      const count = await db().topic.count({ where: { userId: req.user.id } });
      if (count >= MAX_FREE_TOPICS) throw problem(403, `Free accounts can track up to ${MAX_FREE_TOPICS} topics. Upgrade for unlimited.`);
    }
    const activeDb = db();
    const topic = await activeDb.topic.create({ data: { name, query, category: category || null, userId: req.user.id } });
    const isMock = database !== getDb || typeof activeDb.snapshot?.create !== 'function';
    if (!isMock && process.env.NODE_ENV !== 'test') {
      syncTopic(topic.id, activeDb).catch((err) => {
        console.error(`Initial snapshot pull failed for topic ${topic.id}:`, err.message);
      });
    }
    res.status(201).json({ topic });
  }));

  router.post('/:id/sync', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) throw problem(404, 'Topic not found.');
    if (topic.userId !== req.user.id) throw problem(403, 'You do not own this topic.');

    const isMock = database !== getDb || typeof client.snapshot?.create !== 'function';
    if (isMock) {
      return res.json({
        topic,
        snapshot: null,
        diff: null,
        isBaseline: true,
        message: 'Mock sync complete.',
      });
    }

    try {
      const result = await syncTopic(topic.id, client);
      res.json({
        topic: result.topic,
        snapshot: result.snapshot,
        diff: result.diff,
        isBaseline: result.isBaseline,
        message: result.isBaseline
          ? 'Initial baseline captured from Google Search & News.'
          : (result.diff ? 'New live changes detected and recorded!' : 'Checked Google Search & News. No changes since last snapshot.'),
      });
    } catch (err) {
      throw problem(502, `Live sync failed: ${err.message}`);
    }
  }));

  router.delete('/:id', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) throw problem(404, 'Topic not found.');
    if (topic.userId !== req.user.id) throw problem(403, 'You do not own this topic.');
    await client.$transaction(async (tx) => {
      await tx.diff.deleteMany({ where: { topicId: topic.id } });
      await tx.snapshot.deleteMany({ where: { topicId: topic.id } });
      await tx.topic.delete({ where: { id: topic.id } });
    });
    res.status(204).end();
  }));

  router.post('/:id/alert-settings', attempt(async (req, res) => {
    const email = req.body?.email === null ? null : req.body?.email !== undefined ? clean(req.body.email) : undefined;
    const alertEnabled = req.body?.alertEnabled;
    const alertFrequency = req.body?.alertFrequency;
    const alertHour = req.body?.alertHour;
    const alertDays = req.body?.alertDays;
    if (email && (email.length > 254 || !EMAIL.test(email))) throw problem(400, 'Provide a valid email address or null to disable alerts.');
    if (email && !isAlertConfigured()) throw problem(409, 'Email alerts are unavailable until SMTP is configured.');
    if (alertFrequency !== undefined && !['1h', '3h', '1d', '3d'].includes(alertFrequency)) throw problem(400, 'alertFrequency must be one of: 1h, 3h, 1d, 3d');
    if (alertHour !== undefined && alertHour !== null) {
      const hour = Number(alertHour);
      const validHours = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0];
      if (!validHours.includes(hour)) {
        throw problem(400, 'alertHour must be between 12 PM (12) and 12 AM (0/23).');
      }
    }
    if (alertDays !== undefined && !['weekdays', 'all'].includes(alertDays)) {
      throw problem(400, 'alertDays must be weekdays or all.');
    }
    const client = db();
    const existing = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!existing) throw problem(404, 'Topic not found.');
    if (existing.userId !== req.user.id) throw problem(403, 'You do not own this topic.');
    const data = {};
    if (email !== undefined) {
      data.alertEmail = email || null;
    } else if (alertEnabled === true && !existing.alertEmail && req.user?.email) {
      data.alertEmail = req.user.email;
    }
    if (typeof alertEnabled === 'boolean') data.alertEnabled = alertEnabled;
    if (alertFrequency) data.alertFrequency = alertFrequency;
    if (alertHour !== undefined) data.alertHour = alertHour === null ? null : Number(alertHour);
    if (alertDays) data.alertDays = alertDays;
    if (Object.keys(data).length === 0) throw problem(400, 'Provide at least one setting to update.');
    const topic = await client.topic.update({ where: { id: req.params.id }, data });
    res.json({ topic });
  }));

  return router;
}

export default createTopicsRouter;
