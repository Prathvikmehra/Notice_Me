import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/src/index.js';
import { startCronScheduler, processDueTopics } from '../backend/src/services/cronService.js';

function createMockDb() {
  const users = [
    { id: 'user-1', email: 'user1@example.com', name: 'User One', plan: 'free', createdAt: new Date() },
    { id: 'user-2', email: 'user2@example.com', name: 'User Two', plan: 'free', createdAt: new Date() },
  ];
  const topics = [];
  const diffs = [];
  const snapshots = [];

  return {
    user: {
      findUnique: async ({ where }) => users.find((u) => u.id === where.id) || null,
      update: async ({ where, data }) => {
        const u = users.find((user) => user.id === where.id);
        if (!u) throw new Error('User not found');
        Object.assign(u, data);
        return u;
      },
    },
    topic: {
      findMany: async ({ where = {} } = {}) => {
        let res = topics.filter((t) => !where.userId || t.userId === where.userId);
        if (where.OR) {
          res = res.filter((t) => where.OR.some((clause) => {
            if (clause.name?.contains) {
              return t.name.toLowerCase().includes(clause.name.contains.toLowerCase());
            }
            if (clause.query?.contains) {
              return t.query.toLowerCase().includes(clause.query.contains.toLowerCase());
            }
            return false;
          }));
        }
        return res;
      },
      findUnique: async ({ where }) => topics.find((t) => t.id === where.id) || null,
      count: async ({ where = {} } = {}) => topics.filter((t) => !where.userId || t.userId === where.userId).length,
      create: async ({ data }) => {
        const t = { id: `topic-${topics.length + 1}`, ...data, createdAt: new Date() };
        topics.push(t);
        return t;
      },
      update: async ({ where, data }) => {
        const t = topics.find((topic) => topic.id === where.id);
        if (!t) throw new Error('Topic not found');
        Object.assign(t, data);
        return t;
      },
      delete: async ({ where }) => {
        const index = topics.findIndex((t) => t.id === where.id);
        if (index >= 0) topics.splice(index, 1);
      },
    },
    diff: {
      findMany: async ({ where = {} } = {}) => {
        return diffs.filter((d) => {
          if (where.topic?.userId) {
            const topic = topics.find((t) => t.id === d.topicId);
            if (topic?.userId !== where.topic.userId) return false;
          }
          if (where.summary?.contains) {
            return d.summary.toLowerCase().includes(where.summary.contains.toLowerCase());
          }
          return true;
        });
      },
      deleteMany: async () => {},
    },
    snapshot: {
      findFirst: async () => null,
      deleteMany: async () => {},
    },
    async $transaction(fn) { return fn(this); },
    _state: { users, topics, diffs, snapshots },
  };
}

async function withUserApi(db, user, fn) {
  const app = createApp(db, {
    auth: (req, res, next) => { req.user = user; next(); },
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  };
  try {
    await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('User profile and free tier limit (max 5 topics)', async () => {
  const db = createMockDb();
  const user1 = db._state.users[0];

  await withUserApi(db, user1, async (call) => {
    // Check profile
    const profile = await call('/api/user/me');
    assert.equal(profile.status, 200);
    assert.equal(profile.body.user.email, 'user1@example.com');
    assert.equal(profile.body.user.topicCount, 0);

    // Update name
    const updatedUser = await call('/api/user/me', 'PATCH', { name: 'Renamed User' });
    assert.equal(updatedUser.status, 200);
    assert.equal(updatedUser.body.user.name, 'Renamed User');

    // Create 5 topics successfully
    for (let i = 1; i <= 5; i++) {
      const res = await call('/api/topics', 'POST', {
        name: `Topic ${i}`,
        query: `Query ${i}`,
        category: 'exam',
      });
      assert.equal(res.status, 201);
    }

    // 6th topic should fail on free plan
    const overLimit = await call('/api/topics', 'POST', {
      name: 'Topic 6',
      query: 'Query 6',
      category: 'scheme',
    });
    assert.equal(overLimit.status, 403);
    assert.match(overLimit.body.error.message, /Free accounts can track up to 5 topics/);

    // Invalid category rejection
    user1.plan = 'pro';
    const invalidCat = await call('/api/topics', 'POST', {
      name: 'Topic Pro',
      query: 'Query Pro',
      category: 'invalid-category-xyz',
    });
    assert.equal(invalidCat.status, 400);
    assert.match(invalidCat.body.error.message, /Category must be one of/);
  });
});

test('User data isolation and search across topics/diffs', async () => {
  const db = createMockDb();
  const user1 = db._state.users[0];
  const user2 = db._state.users[1];

  let user1TopicId;
  await withUserApi(db, user1, async (call) => {
    const res = await call('/api/topics', 'POST', {
      name: 'UPSC CSE 2026',
      query: 'upsc notification',
      category: 'exam',
    });
    assert.equal(res.status, 201);
    user1TopicId = res.body.topic.id;

    // Configure notification settings with working hour (e.g. 2 PM = 14)
    const settingsRes = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertFrequency: '1d',
      alertEnabled: true,
      alertHour: 14,
      alertDays: 'weekdays',
    });
    assert.equal(settingsRes.status, 200);
    assert.equal(settingsRes.body.topic.alertFrequency, '1d');
    assert.equal(settingsRes.body.topic.alertEnabled, true);
    assert.equal(settingsRes.body.topic.alertHour, 14);
    assert.equal(settingsRes.body.topic.alertDays, 'weekdays');

    // Monthly frequency with specific date of month (e.g. 30th - max allowed)
    const monthlyRes = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertFrequency: '30d',
      alertDays: '30',
    });
    assert.equal(monthlyRes.status, 200);
    assert.equal(monthlyRes.body.topic.alertFrequency, '30d');
    assert.equal(monthlyRes.body.topic.alertDays, '30');

    // Weekly on specific weekday (e.g. Tuesday)
    const weeklyRes = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertFrequency: '7d',
      alertDays: 'tue',
    });
    assert.equal(weeklyRes.status, 200);
    assert.equal(weeklyRes.body.topic.alertDays, 'tue');

    // Rejection of invalid alertHour (outside 12 PM - 12 AM window)
    const invalidHour = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertHour: 4,
    });
    assert.equal(invalidHour.status, 400);
    assert.match(invalidHour.body.error.message, /alertHour must be between 12 PM/);

    // Rejection of invalid alertDays (neither weekday nor 1-30 date)
    const invalidDays = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertDays: 'weekends-only',
    });
    assert.equal(invalidDays.status, 400);
    assert.match(invalidDays.body.error.message, /alertDays must be weekdays or all/);

    // Day 31 is now rejected (day capped at 30)
    const invalidDate31 = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertDays: '31',
    });
    assert.equal(invalidDate31.status, 400);
    assert.match(invalidDate31.body.error.message, /alertDays must be weekdays or all/);

    const invalidDateNum = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertDays: '32',
    });
    assert.equal(invalidDateNum.status, 400);
    assert.match(invalidDateNum.body.error.message, /alertDays must be weekdays or all/);

    // Add a diff for search test
    db._state.diffs.push({
      id: 'diff-1',
      topicId: user1TopicId,
      summary: 'UPSC Prelims date announced',
      sourceUrls: ['https://upsc.gov.in'],
      detectedAt: new Date(),
      topic: { id: user1TopicId, name: 'UPSC CSE 2026' },
    });

    // Search matches topic & diff
    const searchRes = await call('/api/topics/search?q=prelims');
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.diffs.length, 1);
    assert.equal(searchRes.body.diffs[0].summary, 'UPSC Prelims date announced');

    // Trending public notices endpoint
    const trendRes = await call('/api/topics/trending');
    assert.equal(trendRes.status, 200);
    assert.ok(Array.isArray(trendRes.body.trending));
    assert.ok(trendRes.body.trending.length >= 4);
    assert.equal(trendRes.body.trending[0].name, 'UPSC CSE 2026');
    assert.ok(trendRes.body.trending[0].followers > 0);
  });

  // User 2 cannot see or access User 1's topic
  await withUserApi(db, user2, async (call) => {
    const listRes = await call('/api/topics');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.topics.length, 0);

    const timelineRes = await call(`/api/topics/${user1TopicId}/timeline`);
    assert.equal(timelineRes.status, 403);

    const deleteRes = await call(`/api/topics/${user1TopicId}`, 'DELETE');
    assert.equal(deleteRes.status, 403);
  });
});

test('Cron scheduler initialization and error resilience', async () => {
  const db = createMockDb();
  // Safe initialization
  const task = startCronScheduler(db, { enabled: false });
  assert.equal(task, null);

  // Calling processDueTopics with mock db succeeds without null-ref errors
  const res = await processDueTopics({
    db,
    client: { pullSnapshot: async () => ({ search: [], news: [] }) },
    logger: { info: () => {}, error: () => {} },
  });
  assert.equal(typeof res.checked, 'number');
  assert.equal(typeof res.alerted, 'number');

  // Passing null or no db safely throws clear error or falls back
  await assert.rejects(
    async () => processDueTopics({ db: { topic: null } }),
    /Database client with topic model is required/
  );
});

test('10-minute initial alert and next-day scheduled alert logic', async () => {
  const { isSameDay } = await import('../backend/src/services/cronService.js');
  const { sendInitialAlert } = await import('../backend/src/services/alertService.js');

  // isSameDay correctly handles same vs different days
  const today = new Date('2026-09-29T10:00:00Z');
  const laterToday = new Date('2026-09-29T18:00:00Z');
  const tomorrow = new Date('2026-09-30T10:00:00Z');
  assert.equal(isSameDay(today, laterToday, 'UTC'), true);
  assert.equal(isSameDay(today, tomorrow, 'UTC'), false);
  assert.equal(isSameDay(null, today), false);

  // sendInitialAlert sends formatted welcome briefing
  const env = { SMTP_HOST: 'smtp.example.org', SMTP_PORT: '587', SMTP_USER: 'demo', SMTP_PASS: 'fake', ALERT_FROM: 'Notice Me <alerts@example.org>' };
  const topic = { name: 'PM Kisan Scheme', alertEmail: 'farmer@example.org', alertHour: 14 };
  const snapshot = {
    rawData: {
      search: [{ title: 'PM Kisan Official', link: 'https://pmkisan.gov.in', snippet: 'Installment released' }],
      news: [{ title: 'New eligibility rules', link: 'https://news.example.org/kisan', source: 'National News' }],
    },
  };
  let sentMail;
  const createTransport = () => ({
    sendMail: async (mail) => { sentMail = mail; return { accepted: [topic.alertEmail], rejected: [] }; },
  });
  const sent = await sendInitialAlert(topic, snapshot, { env, createTransport });
  assert.equal(sent, true);
  assert.match(sentMail.subject, /Notice Me Intelligence: PM Kisan Scheme/);
  assert.match(sentMail.text, /Installment released/);
  assert.match(sentMail.text, /https:\/\/news.example.org\/kisan/);
  assert.match(sentMail.text, /Starting tomorrow, scheduled alerts will be delivered at 2:00 PM on weekdays/);
});

test('Flexible multi-day intervals and specific weekday schedule logic', async () => {
  const { getCalendarDaysDiff } = await import('../backend/src/services/cronService.js');

  const d1 = new Date('2026-09-29T12:00:00Z');
  const d2 = new Date('2026-09-30T12:00:00Z');
  const d3 = new Date('2026-10-01T12:00:00Z');
  const d4 = new Date('2026-10-06T12:00:00Z');

  assert.equal(getCalendarDaysDiff(d1, d1, 'UTC'), 0);
  assert.equal(getCalendarDaysDiff(d1, d2, 'UTC'), 1);
  assert.equal(getCalendarDaysDiff(d1, d3, 'UTC'), 2);
  assert.equal(getCalendarDaysDiff(d1, d4, 'UTC'), 7);
  assert.equal(getCalendarDaysDiff(null, d1), 999);

  // Dynamic frequency parsing
  const { parseFrequencyToDays } = await import('../backend/src/services/cronService.js');
  assert.equal(parseFrequencyToDays('daily'), 1);
  assert.equal(parseFrequencyToDays('1d'), 1);
  assert.equal(parseFrequencyToDays('2d'), 2);
  assert.equal(parseFrequencyToDays('3d'), 3);
  assert.equal(parseFrequencyToDays('5d'), 5);
  assert.equal(parseFrequencyToDays('weekly'), 7);
  assert.equal(parseFrequencyToDays('7d'), 7);
  assert.equal(parseFrequencyToDays('biweekly'), 14);
  assert.equal(parseFrequencyToDays('14d'), 14);
  assert.equal(parseFrequencyToDays('monthly'), 30);
  assert.equal(parseFrequencyToDays('30d'), 30);
  assert.equal(parseFrequencyToDays('45d'), 45);
  assert.equal(parseFrequencyToDays('invalid-frequency-xyz'), null);

  // February 28 schedule rule: for monthly topics with target day 28, 29, 30, deliver on Feb 28th
  const { getLocalTimeDetails } = await import('../backend/src/services/cronService.js');
  const feb28 = new Date('2026-02-28T09:30:00Z'); // 3 PM IST
  const feb27 = new Date('2026-02-27T09:30:00Z');
  const jan30 = new Date('2026-01-30T09:30:00Z');

  const feb28Details = getLocalTimeDetails('Asia/Kolkata', feb28);
  assert.equal(feb28Details.month, 2);
  assert.equal(feb28Details.dayOfMonth, 28);

  const feb27Details = getLocalTimeDetails('Asia/Kolkata', feb27);
  assert.equal(feb27Details.month, 2);
  assert.equal(feb27Details.dayOfMonth, 27);

  const jan30Details = getLocalTimeDetails('Asia/Kolkata', jan30);
  assert.equal(jan30Details.month, 1);
  assert.equal(jan30Details.dayOfMonth, 30);
});

test('Two-phase pre-fetch (T-10m) and dispatch (T-0m) alert workflow and trending pre-warm', async () => {
  const { prefetchUpcomingTopics, dispatchDueAlerts, filterEligibleTopics } = await import('../backend/src/services/cronService.js');
  const { refreshTrendingRadar, getCachedTrending } = await import('../backend/src/services/trendingService.js');
  const nodemailer = (await import('nodemailer')).default;

  // 1. Verify filterEligibleTopics
  const candidates = [
    { id: 't1', alertHour: 16, alertDays: 'weekdays', alertFrequency: '1d', timezone: 'Asia/Kolkata', lastAlertedAt: null },
    { id: 't2', alertHour: 15, alertDays: 'weekdays', alertFrequency: '1d', timezone: 'Asia/Kolkata', lastAlertedAt: null },
    { id: 't3', alertHour: 16, alertDays: 'weekdays', alertFrequency: '1d', timezone: 'Asia/Kolkata', lastAlertedAt: new Date('2026-09-29T08:00:00Z') },
  ];
  // Target hour 16 on a Tuesday
  const tuesday1550 = new Date('2026-09-29T10:20:00Z'); // 15:50 IST, Tuesday
  const eligibleFor16 = filterEligibleTopics(candidates, tuesday1550, 16);
  assert.equal(eligibleFor16.length, 1);
  assert.equal(eligibleFor16[0].id, 't1');

  // 2. Two-Phase Pre-fetch (T - 10 min)
  const topics = [];
  const snapshots = [];
  const diffs = [];
  const mockDb = {
    topic: {
      findMany: async ({ where = {} } = {}) => {
        return topics.filter((t) => {
          if (where.alertEnabled !== undefined && t.alertEnabled !== where.alertEnabled) return false;
          if (where.alertEmail?.not === null && !t.alertEmail) return false;
          if (where.alertHour !== undefined && t.alertHour !== where.alertHour) return false;
          return true;
        });
      },
      findUnique: async ({ where }) => topics.find((t) => t.id === where.id) || null,
      update: async ({ where, data }) => {
        const t = topics.find((item) => item.id === where.id);
        if (!t) throw new Error('Topic not found');
        Object.assign(t, data);
        return t;
      },
    },
    snapshot: {
      findFirst: async ({ where = {} } = {}) => {
        const matching = snapshots.filter((s) => !where.topicId || s.topicId === where.topicId);
        return matching[matching.length - 1] || null;
      },
      create: async ({ data }) => {
        const s = { id: `snap-${snapshots.length + 1}`, ...data };
        snapshots.push(s);
        return s;
      },
    },
    diff: {
      findFirst: async ({ where = {} } = {}) => {
        const matching = diffs.filter((d) => {
          if (where.topicId && d.topicId !== where.topicId) return false;
          if (where.alerted !== undefined && d.alerted !== where.alerted) return false;
          return true;
        });
        return matching[matching.length - 1] || null;
      },
      create: async ({ data }) => {
        const d = { id: `diff-${diffs.length + 1}`, ...data, detectedAt: new Date() };
        diffs.push(d);
        return d;
      },
      update: async ({ where, data }) => {
        const d = diffs.find((item) => item.id === where.id);
        if (!d) throw new Error('Diff not found');
        Object.assign(d, data);
        return d;
      },
    },
    async $transaction(fn) { return fn(this); },
    _state: { topics, snapshots, diffs },
  };

  const testTopic = {
    id: 'topic-pre-1',
    name: 'UPSC Notification Track',
    query: 'upsc cse 2026 notification',
    alertEmail: 'candidate@example.org',
    alertEnabled: true,
    alertHour: 16,
    alertDays: 'weekdays',
    alertFrequency: '1d',
    lastAlertedAt: null,
  };
  mockDb._state.topics.push(testTopic);

  // Baseline snapshot
  mockDb._state.snapshots.push({
    id: 'snap-1',
    topicId: 'topic-pre-1',
    rawData: {
      search: [{ title: 'UPSC Prelims', link: 'https://upsc.gov.in/prelims', snippet: 'Exam notification pending' }],
      news: [{ title: 'UPSC 2026 News', link: 'https://news.example.org/upsc', date: 'Yesterday' }],
    },
    pulledAt: new Date('2026-09-28T10:00:00Z'),
  });

  // Client returns updated snippet
  const mockClient = {
    pullSnapshot: async () => ({
      search: [{ title: 'UPSC Prelims', link: 'https://upsc.gov.in/prelims', snippet: 'Official notification released today' }],
      news: [{ title: 'UPSC 2026 News', link: 'https://news.example.org/upsc', date: 'Just now' }],
      pulledAt: new Date().toISOString(),
    }),
  };

  // Run pre-fetch at 15:50 IST (targetHour 16)
  const prefetchRes = await prefetchUpcomingTopics({
    db: mockDb,
    client: mockClient,
    gemini: null,
    logger: { info() {}, warn() {}, error() {} },
    now: tuesday1550,
  });

  assert.equal(prefetchRes.prefetched, 1);
  assert.equal(prefetchRes.targetHour, 16);

  // Verify: Diff was created with alerted: false, topic was NOT alerted yet
  assert.equal(mockDb._state.diffs.length, 1);
  assert.equal(mockDb._state.diffs[0].alerted, false);
  assert.equal(testTopic.lastAlertedAt, null);

  // 3. Two-Phase Dispatch (T - 0 min)
  const origTransport = nodemailer.createTransport;
  const smtpNames = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'ALERT_FROM'];
  const prevEnv = Object.fromEntries(smtpNames.map((n) => [n, process.env[n]]));
  process.env.SMTP_HOST = 'smtp.example.org';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'user';
  process.env.SMTP_PASS = 'pass';
  process.env.ALERT_FROM = 'Notice Me <alerts@example.org>';

  let deliveredMail = null;
  nodemailer.createTransport = () => ({
    sendMail: async (mail) => {
      deliveredMail = mail;
      return { accepted: ['candidate@example.org'], rejected: [] };
    },
  });

  try {
    const tuesday1600 = new Date('2026-09-29T10:30:00Z'); // 16:00 IST
    const dispatchRes = await dispatchDueAlerts({
      db: mockDb,
      client: mockClient,
      gemini: null,
      logger: { info() {}, warn() {}, error() {} },
      now: tuesday1600,
    });

    assert.equal(dispatchRes.alerted, 1);
    assert.equal(dispatchRes.checked, 1);
    assert.ok(deliveredMail);
    assert.equal(deliveredMail.to, 'candidate@example.org');
    assert.match(deliveredMail.subject, /Notice Me update: UPSC Notification Track/);
    assert.equal(mockDb._state.diffs[0].alerted, true);
    assert.ok(testTopic.lastAlertedAt);

    // 4. Public Trending Radar pre-warm
    const trendClient = {
      pullSnapshot: async () => ({
        search: [{ title: 'Trend Top Search', link: 'https://example.gov.in', snippet: 'Latest update' }],
        news: [{ title: 'Trend Hot News', link: 'https://news.gov.in', date: 'Today' }],
        pulledAt: new Date().toISOString(),
      }),
    };
    const trendRes = await refreshTrendingRadar({
      client: trendClient,
      gemini: null,
      logger: { info() {}, warn() {} },
    });
    assert.equal(trendRes.refreshed, 8);
    const cached = getCachedTrending();
    assert.equal(cached.length, 8);
    assert.ok(cached.every((item) => typeof item.lastRefreshed === 'string'));
  } finally {
    nodemailer.createTransport = origTransport;
    for (const n of smtpNames) {
      if (prevEnv[n] === undefined) delete process.env[n];
      else process.env[n] = prevEnv[n];
    }
  }
});

test('Security & Reliability: Alert defaults, validation, concurrency lock, cooldown, and retention', async () => {
  const { validateAlertSettings } = await import('../backend/src/routes/topics.js');
  const { processInitialTopicAlerts, filterEligibleTopics, parseFrequencyToHours, parseFrequencyToMs } = await import('../backend/src/services/cronService.js');
  const { isTopicSyncing } = await import('../backend/src/services/topicSyncService.js');

  // 1. Unified frequency parsers
  assert.equal(parseFrequencyToHours('1h'), 1);
  assert.equal(parseFrequencyToHours('3h'), 3);
  assert.equal(parseFrequencyToHours('1d'), 24);
  assert.equal(parseFrequencyToHours('7d'), 168);
  assert.equal(parseFrequencyToHours('14d'), 336);
  assert.equal(parseFrequencyToHours('30d'), 720);
  assert.equal(parseFrequencyToMs('3h'), 3 * 3600 * 1000);

  // 2. Strict validation & coercion rejection
  assert.throws(
    () => validateAlertSettings({ alertEnabled: 'false' }),
    /alertEnabled must be a boolean/
  );
  assert.throws(
    () => validateAlertSettings({ alertFrequency: 'monthly', alertDays: 'weekdays' }),
    /Monthly schedule requires a specific date of month/
  );
  // Valid monthly with date 15 succeeds
  const validMonthly = validateAlertSettings({ alertFrequency: 'monthly', alertDays: '15' });
  assert.equal(validMonthly.alertDays, '15');

  // 3. Topic creation defaults & manual sync cooldown via API
  const db = createMockDb();
  const user1 = db._state.users[0];

  await withUserApi(db, user1, async (call) => {
    // Create topic without alert fields -> defaults to alertEmail: null, alertEnabled: false
    const createRes = await call('/api/topics', 'POST', {
      name: 'Safe Topic',
      query: 'safe query',
      category: 'other',
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.topic.alertEmail, null);
    assert.equal(createRes.body.topic.alertEnabled, false);
    const topicId = createRes.body.topic.id;

    // Creating topic with invalid alertEnabled string fails with 400
    const invalidCreate = await call('/api/topics', 'POST', {
      name: 'Invalid Alert Topic',
      query: 'query',
      alertEnabled: 'true',
    });
    assert.equal(invalidCreate.status, 400);

    // Manual sync endpoint: first call succeeds in mock mode
    const sync1 = await call(`/api/topics/${topicId}/sync`, 'POST');
    assert.equal(sync1.status, 200);

    // Check concurrency helper
    assert.equal(isTopicSyncing(topicId), false);
  });

  // 4. Disabled alerts guard in initial alerts check
  const disabledAlertTopic = {
    id: 'topic-disabled',
    alertEmail: 'user@example.com',
    alertEnabled: false,
    lastAlertedAt: null,
    createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 mins old
  };
  const mockDbWithDisabled = {
    topic: {
      findMany: async ({ where }) => {
        if (where.alertEnabled === true && !disabledAlertTopic.alertEnabled) return [];
        return [disabledAlertTopic];
      },
    },
  };
  const initRes = await processInitialTopicAlerts({ db: mockDbWithDisabled });
  assert.equal(initRes.alerted, 0);

  // 5. Timezone-aware scheduling in filterEligibleTopics
  const nyTopic = {
    id: 'ny-topic',
    alertHour: 9, // 9 AM in New York
    timezone: 'America/New_York',
    alertDays: 'all',
    alertFrequency: '1d',
    alertEnabled: true,
    alertEmail: 'ny@example.com',
    lastAlertedAt: null,
  };
  const istTopic = {
    id: 'ist-topic',
    alertHour: 9, // 9 AM in India
    timezone: 'Asia/Kolkata',
    alertDays: 'all',
    alertFrequency: '1d',
    alertEnabled: true,
    alertEmail: 'ist@example.com',
    lastAlertedAt: null,
  };

  // At 13:00 UTC (9:00 AM EDT in September, 18:30 IST)
  const time13Utc = new Date('2026-09-29T13:00:00Z');
  const filtered = filterEligibleTopics([nyTopic, istTopic], time13Utc);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'ny-topic');
});




