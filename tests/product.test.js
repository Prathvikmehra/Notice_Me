import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/src/index.js';
import { sendDiffAlert, isAlertConfigured } from '../backend/src/services/alertService.js';

const FAKE_USER = { id: 'test-user-001', email: 'test@example.com', name: 'Test', plan: 'free', createdAt: new Date() };

function fakeDatabase() {
  const state = { topics: [], snapshots: [], diffs: [] };
  const db = {
    user: {
      upsert: async () => FAKE_USER,
    },
    topic: {
      findMany: async ({ where } = {}) => where?.userId ? state.topics.filter((t) => t.userId === where.userId) : state.topics,
      findUnique: async ({ where }) => state.topics.find((item) => item.id === where.id) ?? null,
      count: async ({ where } = {}) => where?.userId ? state.topics.filter((t) => t.userId === where.userId).length : state.topics.length,
      create: async ({ data }) => {
        const topic = { id: `topic-${state.topics.length + 1}`, ...data, alertEmail: null, alertEnabled: false, alertFrequency: '3h', lastAlertedAt: null, createdAt: new Date() };
        state.topics.push(topic);
        return topic;
      },
      update: async ({ where, data }) => {
        const topic = state.topics.find((item) => item.id === where.id);
        Object.assign(topic, data);
        return topic;
      },
      delete: async ({ where }) => { state.topics = state.topics.filter((item) => item.id !== where.id); },
    },
    snapshot: {
      findFirst: async ({ where }) => state.snapshots.filter((item) => item.topicId === where.topicId).at(-1) ?? null,
      deleteMany: async ({ where }) => { state.snapshots = state.snapshots.filter((item) => item.topicId !== where.topicId); },
    },
    diff: {
      findMany: async ({ where }) => state.diffs.filter((item) => item.topicId === (where.topicId || where.topic?.userId && state.topics.find((t) => t.userId === where.topic.userId)?.id)).sort((a, b) => b.detectedAt - a.detectedAt),
      deleteMany: async ({ where }) => { state.diffs = state.diffs.filter((item) => item.topicId !== where.topicId); },
    },
    async $transaction(fn) { return fn(this); },
  };
  return { db, state };
}

async function withApi(db, fn) {
  const app = createApp(db, {
    auth: (req, res, next) => { req.user = FAKE_USER; next(); },
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
  };
  try { await fn(call); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('topic CRUD, timeline, latest snapshot and error responses through Express', async () => {
  const { db, state } = fakeDatabase();
  const smtpNames = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'ALERT_FROM'];
  const previousEnv = Object.fromEntries(smtpNames.map((name) => [name, process.env[name]]));
  for (const name of smtpNames) delete process.env[name];
  try {
    await withApi(db, async (call) => {
      assert.equal((await call('/health')).body.status, 'ok');
      assert.deepEqual((await call('/api/topics')).body.topics, []);
      assert.equal((await call('/api/topics', 'POST', { name: ' ', query: ' ' })).status, 400);
      const created = await call('/api/topics', 'POST', { name: ' Exam ', query: ' 2026 notice ', category: 'exam' });
      assert.equal(created.status, 201);
      const id = created.body.topic.id;
      assert.equal(created.body.topic.query, '2026 notice');
      assert.equal((await call('/api/topics')).body.topics.length, 1);
      assert.equal((await call(`/api/topics/${id}/snapshots/latest`)).body.snapshot, null);
      state.snapshots.push({ id: 's1', topicId: id, pulledAt: new Date('2026-09-28T06:00:00Z'), rawData: { search: [], news: [] } });
      state.diffs.push({ id: 'd1', topicId: id, summary: 'Earlier change', sourceUrls: ['https://example.org/one'], detectedAt: new Date('2026-09-28T06:00:00Z') });
      state.diffs.push({ id: 'd2', topicId: id, summary: 'Later change', sourceUrls: ['https://example.org/two'], detectedAt: new Date('2026-09-28T12:00:00Z') });
      assert.equal((await call(`/api/topics/${id}/snapshots/latest`)).body.snapshot.id, 's1');
      const timeline = await call(`/api/topics/${id}/timeline`);
      assert.deepEqual(timeline.body.diffs.map((item) => item.id), ['d2', 'd1']);
      assert.equal((await call(`/api/topics/${id}/alert-settings`, 'POST', { email: 'bad' })).status, 400);
      assert.equal((await call(`/api/topics/${id}/alert-settings`, 'POST', { email: 'demo@example.org' })).status, 409);
      try {
        Object.assign(process.env, { SMTP_HOST: 'smtp.example.org', SMTP_PORT: '587', SMTP_USER: 'demo', SMTP_PASS: 'fake', ALERT_FROM: 'alerts@example.org' });
        const enabled = await call(`/api/topics/${id}/alert-settings`, 'POST', { email: 'demo@example.org' });
        assert.equal(enabled.status, 200);
        assert.equal(enabled.body.topic.alertEmail, 'demo@example.org');
      } finally {
        for (const name of smtpNames) delete process.env[name];
      }
      assert.equal((await call(`/api/topics/${id}/alert-settings`, 'POST', { email: null })).status, 200);
      assert.equal((await call('/api/topics/absent/timeline')).status, 404);
      assert.equal((await call(`/api/topics/${id}`, 'DELETE')).status, 204);
      assert.deepEqual(state.snapshots, []);
      assert.deepEqual(state.diffs, []);
      assert.equal((await call(`/api/topics/${id}/timeline`)).status, 404);
    });
  } finally {
    for (const name of smtpNames) previousEnv[name] === undefined ? delete process.env[name] : process.env[name] = previousEnv[name];
  }
});

test('SMTP service sends a sourced text alert and rejects delivery failures', async () => {
  const env = { SMTP_HOST: 'smtp.example.org', SMTP_PORT: '587', SMTP_USER: 'demo', SMTP_PASS: 'fake', ALERT_FROM: 'Notice Me <alerts@example.org>' };
  assert.equal(isAlertConfigured(env), true);
  assert.equal(isAlertConfigured({}), false);
  const topic = { name: 'Policy\nUpdate', alertEmail: 'reader@example.org' };
  const diff = { summary: 'Eligibility changed', sourceUrls: ['https://example.org/notice'] };
  let sent;
  const createTransport = (settings) => {
    assert.equal(settings.port, 587);
    assert.equal(settings.secure, false);
    assert.equal(settings.requireTLS, true);
    return { sendMail: async (message) => { sent = message; return { accepted: [topic.alertEmail], rejected: [] }; } };
  };
  assert.equal(await sendDiffAlert(topic, diff, { env, createTransport }), true);
  assert.match(sent.text, /Eligibility changed/);
  assert.match(sent.text, /https:\/\/example.org\/notice/);
  assert.ok(!sent.subject.includes('\n'));
  await assert.rejects(sendDiffAlert(topic, diff, { env: {}, createTransport }), /SMTP_HOST/);
  await assert.rejects(sendDiffAlert(topic, diff, { env, createTransport: () => ({ sendMail: async () => { throw new Error('SMTP refused'); } }) }), /SMTP refused/);
  await assert.rejects(sendDiffAlert(topic, diff, { env, createTransport: () => ({ sendMail: async () => ({ accepted: [], rejected: [topic.alertEmail] }) }) }), /did not accept/);
});
