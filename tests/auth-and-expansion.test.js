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

    // Rejection of invalid alertHour (outside 12 PM - 12 AM window)
    const invalidHour = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertHour: 4,
    });
    assert.equal(invalidHour.status, 400);
    assert.match(invalidHour.body.error.message, /alertHour must be between 12 PM/);

    // Rejection of invalid alertDays
    const invalidDays = await call(`/api/topics/${user1TopicId}/alert-settings`, 'POST', {
      alertDays: 'weekends-only',
    });
    assert.equal(invalidDays.status, 400);
    assert.match(invalidDays.body.error.message, /alertDays must be weekdays or all/);

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

