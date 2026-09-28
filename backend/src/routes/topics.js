import { Router } from 'express';
import { getDb } from '../services/db.js';
import { isAlertConfigured } from '../services/alertService.js';

const attempt = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const problem = (status, message) => Object.assign(new Error(message), { status });
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createTopicsRouter(database = getDb) {
  const router = Router();
  const db = () => typeof database === 'function' ? database() : database;

  router.get('/', attempt(async (req, res) => {
    const topics = await db().topic.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ topics });
  }));

  router.post('/', attempt(async (req, res) => {
    const name = clean(req.body?.name);
    const query = clean(req.body?.query);
    const category = req.body?.category == null ? null : clean(req.body.category);
    if (!name || !query || name.length > 120 || query.length > 500 || (category && category.length > 60)) {
      throw problem(400, 'Provide a name (1–120 characters), query (1–500), and optional category (up to 60).');
    }
    const topic = await db().topic.create({ data: { name, query, category: category || null } });
    res.status(201).json({ topic });
  }));

  router.delete('/:id', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) throw problem(404, 'Topic not found.');
    await client.$transaction(async (tx) => {
      await tx.diff.deleteMany({ where: { topicId: topic.id } });
      await tx.snapshot.deleteMany({ where: { topicId: topic.id } });
      await tx.topic.delete({ where: { id: topic.id } });
    });
    res.status(204).end();
  }));

  router.post('/:id/alert-settings', attempt(async (req, res) => {
    const email = req.body?.email === null ? null : clean(req.body?.email);
    if (email && (email.length > 254 || !EMAIL.test(email))) throw problem(400, 'Provide a valid email address or null to disable alerts.');
    if (req.body?.email === undefined) throw problem(400, 'Provide email or null.');
    if (email && !isAlertConfigured()) throw problem(409, 'Email alerts are unavailable until SMTP is configured.');
    const client = db();
    const existing = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!existing) throw problem(404, 'Topic not found.');
    const topic = await client.topic.update({ where: { id: req.params.id }, data: { alertEmail: email || null } });
    res.json({ topic });
  }));

  return router;
}

export default createTopicsRouter;
