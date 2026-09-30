import { Router } from 'express';
import { getDb } from '../services/db.js';
import * as alertService from '../services/alertService.js';
import { syncTopic, isTopicSyncing } from '../services/topicSyncService.js';
import { parseFrequencyToDays, parseFrequencyToHours } from '../services/cronService.js';
import { getCachedTrending } from '../services/trendingService.js';
import { requireAuth } from '../middleware/auth.js';

const isAlertConfigured = alertService.isAlertConfigured;

const attempt = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const problem = (status, message) => Object.assign(new Error(message), { status });
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = ['scheme', 'exam', 'recruitment', 'case', 'policy', 'admission', 'other'];
const MAX_FREE_TOPICS = 5;
const VALID_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0];
const VALID_DAYS = ['weekdays', 'all', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Rate limit map: userId -> [timestamp, timestamp, ...]
const userSyncHistory = new Map();

function checkUserSyncRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxSyncs = 10;

  // Cleanup expired entries periodically to prevent memory leaks
  if (userSyncHistory.size > 500) {
    for (const [uid, times] of userSyncHistory) {
      const active = times.filter((t) => now - t < windowMs);
      if (active.length === 0) userSyncHistory.delete(uid);
      else userSyncHistory.set(uid, active);
    }
  }

  const timestamps = userSyncHistory.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < windowMs);
  if (validTimestamps.length >= maxSyncs) {
    throw problem(429, 'Rate limit exceeded: maximum 10 manual syncs per minute. Please wait.');
  }
  validTimestamps.push(now);
  userSyncHistory.set(userId, validTimestamps);
}

export function validateAlertSettings(body = {}, { isUpdate = false, userEmail = null, existing = null } = {}) {
  const result = {};

  // 1. Email validation
  const rawEmail = body.email !== undefined ? body.email : body.alertEmail;
  if (rawEmail !== undefined) {
    if (rawEmail === null || rawEmail === '') {
      result.alertEmail = null;
    } else {
      const email = clean(rawEmail);
      if (email.length > 254 || !EMAIL.test(email)) {
        throw problem(400, 'Provide a valid email address or null to disable alerts.');
      }
      result.alertEmail = email;
    }
  }

  // 2. Strict boolean check for alertEnabled
  if (body.alertEnabled !== undefined) {
    if (typeof body.alertEnabled !== 'boolean') {
      throw problem(400, 'alertEnabled must be a boolean (true or false).');
    }
    result.alertEnabled = body.alertEnabled;
  }

  // 3. Frequency validation
  if (body.alertFrequency !== undefined && body.alertFrequency !== null) {
    const freq = clean(body.alertFrequency);
    const hours = parseFrequencyToHours(freq);
    if (!hours || hours < 1) {
      throw problem(400, 'alertFrequency must specify a valid interval (e.g. 1h, 3h, 1d, 2d, 3d, weekly, monthly, 14d).');
    }
    result.alertFrequency = freq;
  }

  // 4. Hour validation
  if (body.alertHour !== undefined && body.alertHour !== null) {
    const hour = Number(body.alertHour);
    if (!Number.isInteger(hour) || !VALID_HOURS.includes(hour)) {
      throw problem(400, 'alertHour must be between 12 PM (12) and 12 AM (0/23).');
    }
    result.alertHour = hour;
  } else if (body.alertHour === null && isUpdate) {
    result.alertHour = null;
  }

  // 5. Day validation
  const freqToCheck = result.alertFrequency || existing?.alertFrequency || body.alertFrequency || '1d';
  const isMonthly = ['monthly', '30d', '1m'].includes(String(freqToCheck).toLowerCase().trim());

  if (body.alertDays !== undefined && body.alertDays !== null) {
    const days = clean(body.alertDays);
    const isMonthDay = /^(?:[1-9]|[12][0-9]|30)$/.test(days);
    if (!VALID_DAYS.includes(days) && !isMonthDay) {
      throw problem(400, 'alertDays must be weekdays or all, a specific day (mon-sun), or date of month (1-30).');
    }
    if (isMonthly && !isMonthDay) {
      throw problem(400, 'Monthly schedule requires a specific date of month (1-30) for alertDays.');
    }
    result.alertDays = days;
  } else if (isMonthly && !isUpdate) {
    result.alertDays = '1';
  }

  // 6. Timezone validation (optional)
  if (body.timezone !== undefined && body.timezone !== null) {
    const tz = clean(body.timezone);
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      result.timezone = tz;
    } catch {
      throw problem(400, 'Provide a valid IANA timezone (e.g. Asia/Kolkata, America/New_York).');
    }
  }

  // 7. Verify SMTP availability only if email was explicitly set in this request
  const hasExplicitEmail = body.email !== undefined || body.alertEmail !== undefined;
  if (hasExplicitEmail && result.alertEmail && !isAlertConfigured()) {
    throw problem(409, 'Email alerts are unavailable until SMTP is configured.');
  }

  return result;
}

export function createTopicsRouter(database = getDb) {
  const router = Router();
  const db = () => typeof database === 'function' ? database() : database;

  // Public endpoint for trending tracks (accessible without auth)
  router.get('/trending', attempt(async (req, res) => {
    const trending = getCachedTrending();
    try {
      const client = db();
      if (client?.topic?.findMany) {
        const dbTopics = await client.topic.findMany({
          select: { name: true, query: true },
        });
        const enriched = trending.map((item) => {
          const itemQ = (item.query || '').toLowerCase().trim();
          const itemName = (item.name || '').toLowerCase().trim();
          const count = dbTopics.filter((t) => {
            const tQ = (t.query || '').toLowerCase().trim();
            const tName = (t.name || '').toLowerCase().trim();
            return (tQ && tQ === itemQ) || (tName && tName === itemName);
          }).length;
          return {
            ...item,
            followers: count,
          };
        });
        return res.json({ trending: enriched });
      }
    } catch {
      // Fallback to cached default
    }
    res.json({ trending });
  }));

  router.use(requireAuth);

  router.get('/', attempt(async (req, res) => {
    const topics = await db().topic.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({ topics });
  }));

  router.get('/item/:id', attempt(async (req, res) => {
    const topic = await db().topic.findUnique({ where: { id: req.params.id } });
    if (!topic) throw problem(404, 'Topic not found.');
    if (topic.userId !== req.user.id) throw problem(403, 'You do not own this topic.');
    res.json({ topic });
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

    // Validate any alert settings passed on creation
    const validatedAlerts = validateAlertSettings(req.body, { isUpdate: false, userEmail: req.user?.email });

    const activeDb = db();
    const topic = await activeDb.topic.create({
      data: {
        name,
        query,
        category: category || null,
        userId: req.user.id,
        alertEmail: validatedAlerts.alertEmail !== undefined ? validatedAlerts.alertEmail : null,
        alertEnabled: validatedAlerts.alertEnabled !== undefined ? validatedAlerts.alertEnabled : false,
        alertHour: validatedAlerts.alertHour !== undefined ? validatedAlerts.alertHour : 12,
        alertDays: validatedAlerts.alertDays !== undefined ? validatedAlerts.alertDays : 'weekdays',
        alertFrequency: validatedAlerts.alertFrequency !== undefined ? validatedAlerts.alertFrequency : '3h',
        timezone: validatedAlerts.timezone !== undefined ? validatedAlerts.timezone : 'Asia/Kolkata',
      },
    });

    const isMock = database !== getDb || typeof activeDb.snapshot?.create !== 'function';
    if (!isMock && process.env.NODE_ENV !== 'test') {
      // 1. Initial baseline pull immediately
      syncTopic(topic.id, activeDb).catch((err) => {
        console.error(`Initial snapshot pull failed for topic ${topic.id}:`, err.message);
      });

      // 2. Schedule 10-minute check & email only if alerts are explicitly enabled
      const delay = Number(process.env.INITIAL_ALERT_DELAY_MS || 10 * 60 * 1000);
      setTimeout(async () => {
        try {
          const fresh = await activeDb.topic.findUnique({ where: { id: topic.id } });
          if (fresh && fresh.alertEmail && fresh.alertEnabled && !fresh.lastAlertedAt) {
            const syncResult = await syncTopic(fresh.id, activeDb);
            if (!syncResult.diff && isAlertConfigured()) {
              await alertService.sendInitialAlert(fresh, syncResult.snapshot);
            }
            await activeDb.topic.update({
              where: { id: fresh.id },
              data: { lastAlertedAt: new Date() },
            });
          }
        } catch (err) {
          console.error(`10-minute alert failed for topic ${topic.id}:`, err.message);
        }
      }, delay);
    }
    res.status(201).json({ topic });
  }));

  router.post('/:id/sync', attempt(async (req, res) => {
    const client = db();
    const topic = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!topic) throw problem(404, 'Topic not found.');
    if (topic.userId !== req.user.id) throw problem(403, 'You do not own this topic.');

    // Concurrency control: reject if a sync is currently running for this topic
    if (isTopicSyncing(topic.id)) {
      throw problem(409, 'A sync is already in progress for this topic. Please wait.');
    }

    // Rate limiting: per-user frequency check
    checkUserSyncRateLimit(req.user.id);

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

    // Cooldown check: minimum interval between pulls (default 60s)
    const latestSnapshot = await client.snapshot.findFirst({
      where: { topicId: topic.id },
      orderBy: [{ pulledAt: 'desc' }, { id: 'desc' }],
    });
    const COOLDOWN_MS = Number(process.env.MANUAL_SYNC_COOLDOWN_MS || 60 * 1000);
    if (latestSnapshot?.pulledAt) {
      const elapsed = Date.now() - new Date(latestSnapshot.pulledAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        throw problem(429, `Sync cooldown active. Please wait ${remainingSec}s before syncing again.`);
      }
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
      if (err.status) throw err;
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
    const client = db();
    const existing = await client.topic.findUnique({ where: { id: req.params.id } });
    if (!existing) throw problem(404, 'Topic not found.');
    if (existing.userId !== req.user.id) throw problem(403, 'You do not own this topic.');

    const validated = validateAlertSettings(req.body, { isUpdate: true, userEmail: req.user?.email, existing });
    const data = {};
    if (validated.alertEmail !== undefined) data.alertEmail = validated.alertEmail;
    else if (validated.alertEnabled === true && !existing.alertEmail && req.user?.email) {
      data.alertEmail = req.user.email;
    }
    if (validated.alertEnabled !== undefined) data.alertEnabled = validated.alertEnabled;
    if (validated.alertFrequency !== undefined) data.alertFrequency = validated.alertFrequency;
    if (validated.alertHour !== undefined) data.alertHour = validated.alertHour;
    if (validated.alertDays !== undefined) data.alertDays = validated.alertDays;
    if (validated.timezone !== undefined) data.timezone = validated.timezone;

    if (Object.keys(data).length === 0) throw problem(400, 'Provide at least one setting to update.');
    const topic = await client.topic.update({ where: { id: req.params.id }, data });
    res.json({ topic });
  }));

  return router;
}

export default createTopicsRouter;
