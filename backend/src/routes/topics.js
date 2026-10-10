import { Router } from 'express';
import { getDb } from '../services/db.js';
import * as alertService from '../services/alertService.js';
import { syncTopic, isTopicSyncing } from '../services/topicSyncService.js';
import { parseFrequencyToDays, parseFrequencyToHours } from '../services/cronService.js';
import { getCachedTrending, refreshTrendingRadar } from '../services/trendingService.js';
import { getGeminiClient } from '../services/geminiService.js';
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

const isTestEnv = () => process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.some((a) => a.includes('test'));

// Rate limit map: userId -> [timestamp, timestamp, ...]
const userSyncHistory = new Map();

function checkUserSyncRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxSyncs = 10;

  // Cleanup expired entries when map grows
  if (userSyncHistory.size > 50) {
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

  // In-memory cache for enriched trending topics
  let enrichedTrendingCache = null;
  let enrichedTrendingCachedAt = 0;
  const TRENDING_CACHE_TTL_MS = 30 * 1000;

  // Public endpoint for trending tracks (accessible without auth)
  router.get('/trending', attempt(async (req, res) => {
    const isRefreshRequested = req.query?.refresh === 'true';
    const now = Date.now();

    if (!isRefreshRequested && enrichedTrendingCache && (now - enrichedTrendingCachedAt < TRENDING_CACHE_TTL_MS)) {
      res.set('Cache-Control', 'public, max-age=15');
      return res.json({ trending: enrichedTrendingCache });
    }

    let trending = getCachedTrending();

    // If query ?refresh=true requested, force live refresh via SerpApi Trends
    if (!isTestEnv()) {
      if (isRefreshRequested) {
        refreshTrendingRadar().catch(() => {});
        trending = getCachedTrending();
      } else if (trending[0]?.lastRefreshed === null) {
        // Background warm-up
        refreshTrendingRadar().catch(() => {});
      }
    }

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
        enrichedTrendingCache = enriched;
        enrichedTrendingCachedAt = now;
        res.set('Cache-Control', 'public, max-age=15');
        return res.json({ trending: enriched });
      }
    } catch {
      // Fallback to cached default
    }
    res.set('Cache-Control', 'public, max-age=15');
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

  // Cross-topic recent meaningful changes feed (Priority 2: What changed since last visit?)
  router.get('/recent-changes', attempt(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 20)));
    const client = db();
    const diffs = await client.diff.findMany({
      where: { topic: { userId: req.user.id } },
      include: {
        topic: { select: { id: true, name: true, query: true, category: true } },
      },
      orderBy: { detectedAt: 'desc' },
      take: limit,
    });

    const enriched = diffs.map((d) => {
      const parsed = alertService.parseDiffSummary(d.summary, d.topic, d.sourceUrls);
      return {
        id: d.id,
        topicId: d.topicId,
        topic: d.topic,
        detectedAt: d.detectedAt,
        alerted: d.alerted,
        sourceUrls: d.sourceUrls,
        structured: parsed,
      };
    });

    res.json({ diffs: enriched });
  }));

  // Natural language monitor extraction (Priority 6)
  router.post('/parse-intent', attempt(async (req, res) => {
    const promptText = clean(req.body?.prompt);
    if (!promptText || promptText.length < 3) {
      throw problem(400, 'Enter at least 3 characters describing what you want to monitor.');
    }
    const gemini = getGeminiClient();
    const intent = await gemini.parseNaturalLanguageTopic(promptText);
    if (!intent) {
      throw problem(502, 'Unable to extract monitor intent. Please use the standard fields.');
    }
    res.json({ intent });
  }));

  // AI chat analyst over monitored data (Priority 8)
  router.post('/chat', attempt(async (req, res) => {
    const question = clean(req.body?.question);
    const topicId = req.body?.topicId ? clean(req.body.topicId) : null;
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
    if (!question || question.length < 2) {
      throw problem(400, 'Question must be at least 2 characters.');
    }

    const client = db();
    let topic = null;
    if (topicId) {
      topic = await client.topic.findUnique({ where: { id: topicId } });
      if (!topic || topic.userId !== req.user.id) {
        throw problem(404, 'Topic not found.');
      }
    }

    const [userTopics, diffs, snapshots] = await Promise.all([
      client.topic.findMany({
        where: { userId: req.user.id },
        select: { id: true, name: true, query: true, category: true },
      }),
      client.diff.findMany({
        where: topicId ? { topicId } : { topic: { userId: req.user.id } },
        include: { topic: { select: { id: true, name: true } } },
        orderBy: { detectedAt: 'desc' },
        take: topicId ? 6 : 10,
      }),
      client.snapshot.findMany({
        where: topicId ? { topicId } : { topic: { userId: req.user.id } },
        include: { topic: { select: { id: true, name: true, query: true, category: true } } },
        orderBy: { pulledAt: 'desc' },
        take: topicId ? 3 : 5,
      }),
    ]);

    const trending = getCachedTrending();
    const gemini = getGeminiClient();
    const result = await gemini.queryMonitoredChat({
      question,
      topic,
      topics: userTopics,
      diffs,
      snapshots,
      history,
      trending,
    });

    res.json(result);
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

      // Send immediate confirmation email if created with alerts enabled
      if (topic.alertEnabled && topic.alertEmail && alertService.isAlertConfigured()) {
        alertService.sendAlertConfirmationEmail(topic).catch((err) => {
          console.warn(`[Alert] Confirmation email failed for topic "${topic.name}":`, err.message);
          if (err.message?.includes('timeout') || err.code === 'ETIMEDOUT') {
            console.warn(`[Alert Diagnostic] SMTP connection timed out (${process.env.SMTP_HOST}:${process.env.SMTP_PORT}). Check if port 465 (SSL) is needed, verify credentials, or test with scripts/test-smtp.js.`);
          }
        });
      }
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
    if (isTopicSyncing(topic.id)) {
      throw problem(409, 'Topic is currently syncing live data. Please wait a moment before deleting.');
    }
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

    // Send confirmation email whenever alerts are saved as enabled
    if (topic.alertEnabled && topic.alertEmail && alertService.isAlertConfigured()) {
      console.log(`[Alert] Sending activation confirmation email to ${topic.alertEmail} for "${topic.name}"...`);
      alertService.sendAlertConfirmationEmail(topic)
        .then(() => console.log(`[Alert] Successfully delivered confirmation email to ${topic.alertEmail} for "${topic.name}".`))
        .catch((err) => {
          console.warn(`[Alert] Confirmation email failed for topic "${topic.name}":`, err.message);
          if (err.message?.includes('timeout') || err.code === 'ETIMEDOUT') {
            console.warn(`[Alert Diagnostic] SMTP connection timed out (${process.env.SMTP_HOST}:${process.env.SMTP_PORT}). Check if port 465 (SSL) is needed, verify credentials, or test with scripts/test-smtp.js.`);
          }
        });
    }

    res.json({ topic });
  }));

  return router;
}

export default createTopicsRouter;
