import { Router } from 'express';
import { getDb } from '../services/db.js';
import { requireAuth } from '../middleware/auth.js';

const attempt = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

export function createUserRouter(database = getDb) {
  const router = Router();
  const db = () => typeof database === 'function' ? database() : database;

  router.use(requireAuth);

  router.get('/me', attempt(async (req, res) => {
    const topicCount = await db().topic.count({ where: { userId: req.user.id } });
    res.json({ user: { ...req.user, topicCount } });
  }));

  router.patch('/me', attempt(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
    if (name !== undefined && name.length > 120) return res.status(400).json({ error: { message: 'Name must be 120 characters or less.' } });
    const data = {};
    if (name !== undefined) data.name = name || null;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: { message: 'Provide at least one field to update.' } });
    const user = await db().user.update({ where: { id: req.user.id }, data });
    res.json({ user });
  }));

  router.post('/upgrade', attempt(async (req, res) => {
    const targetPlan = req.body?.plan === 'free' ? 'free' : 'pro';
    const user = await db().user.update({
      where: { id: req.user.id },
      data: { plan: targetPlan },
    });
    if (req.user) req.user.plan = targetPlan;
    res.json({
      user,
      message: targetPlan === 'pro'
        ? 'Account upgraded to Pro tier. Unlimited topics unlocked!'
        : 'Account set to Free tier.',
    });
  }));

  return router;
}

export default createUserRouter;
