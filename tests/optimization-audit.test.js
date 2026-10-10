import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyImpact } from '../scripts/diff-engine.js';
import { syncTopic } from '../backend/src/services/topicSyncService.js';
import { createTopicsRouter } from '../backend/src/routes/topics.js';

test('classifyImpact extracts HIGH, MEDIUM, LOW impact tiers consistently', () => {
  assert.equal(classifyImpact('Application deadline extended to 15th'), 'HIGH');
  assert.equal(classifyImpact('Exam postponed due to administrative reasons'), 'HIGH');
  assert.equal(classifyImpact('Admit card download link released on portal'), 'HIGH');
  assert.equal(classifyImpact('Supreme Court stay order issued on reservation list'), 'HIGH');
  assert.equal(classifyImpact('Official notification released for 2026 cycle'), 'MEDIUM');
  assert.equal(classifyImpact('Eligibility criteria revised for junior engineer post'), 'MEDIUM');
  assert.equal(classifyImpact('Routine periodic status check of search results'), 'LOW');
});

test('topicSyncService reuses cached aiBriefing and skips Gemini API when no diff occurs', async () => {
  let geminiCalls = 0;
  const mockGemini = {
    generateBriefing: async () => {
      geminiCalls++;
      return {
        coreStatus: 'Fresh briefing',
        urgency: 'MODERATE',
        volatilityScore: 50,
        keyPoints: [],
        deadlines: [],
        actionRequired: null,
      };
    },
  };

  const storedBriefing = {
    coreStatus: 'Baseline briefing preserved',
    urgency: 'ROUTINE',
    volatilityScore: 20,
    keyPoints: [],
    deadlines: [],
    actionRequired: null,
  };

  const snapshotRow = {
    id: 'snap-1',
    topicId: 'topic-test',
    pulledAt: new Date(Date.now() - 3600000),
    rawData: {
      search: [{ position: 1, title: 'Same Result', link: 'https://example.com/item', snippet: 'No changes here' }],
      news: [{ title: 'Same News', link: 'https://example.com/news', source: 'Source', date: 'Yesterday' }],
      aiBriefing: storedBriefing,
    },
  };

  const mockDb = {
    topic: {
      findUnique: async () => ({ id: 'topic-test', query: 'same query', name: 'Test Topic' }),
      update: async () => ({}),
    },
    snapshot: {
      findFirst: async () => snapshotRow,
      create: async ({ data }) => ({ id: 'snap-2', ...data }),
      findMany: async () => [],
      deleteMany: async () => {},
    },
    diff: {
      create: async () => null,
      findMany: async () => [],
      deleteMany: async () => {},
    },
    async $transaction(fn) {
      return fn(this);
    },
  };

  const mockClient = {
    pullSnapshot: async () => ({
      query: 'same query',
      pulledAt: new Date().toISOString(),
      search: [{ position: 1, title: 'Same Result', link: 'https://example.com/item', snippet: 'No changes here' }],
      news: [{ title: 'Same News', link: 'https://example.com/news', source: 'Source', date: 'Yesterday' }],
    }),
  };

  const result = await syncTopic('topic-test', () => mockDb, mockClient, mockGemini);

  // Gemini generateBriefing should NOT be called because raw snapshot is unchanged
  assert.equal(geminiCalls, 0, 'Gemini briefing should be skipped when snapshot has no diff');
  assert.equal(result.snapshot.rawData.aiBriefing.coreStatus, 'Baseline briefing preserved');
});

test('trending endpoint caches enriched follower counts across repeat requests', async () => {
  let dbQueries = 0;
  const mockDb = {
    topic: {
      findMany: async () => {
        dbQueries++;
        return [
          { name: 'UPSC CSE 2026', query: 'UPSC CSE 2026 prelims notification exam date upsc.gov.in' },
        ];
      },
    },
  };

  const router = createTopicsRouter(() => mockDb);
  const trendingLayer = router.stack.find((l) => l.route?.path === '/trending' && l.route?.methods?.get);
  assert.ok(trendingLayer);

  const req = { query: {} };
  let resHeaders = {};
  let resData = null;
  const res = {
    set: (k, v) => { resHeaders[k] = v; return res; },
    json: (d) => { resData = d; return res; },
  };

  // First request hits DB to calculate follower counts
  await trendingLayer.route.stack[trendingLayer.route.stack.length - 1].handle(req, res, () => {});
  assert.equal(dbQueries, 1);
  assert.ok(Array.isArray(resData.trending));
  assert.equal(resHeaders['Cache-Control'], 'public, max-age=15');

  // Second request uses in-memory cache without hitting database
  await trendingLayer.route.stack[trendingLayer.route.stack.length - 1].handle(req, res, () => {});
  assert.equal(dbQueries, 1, 'Repeat trending request within TTL must use in-memory cache');
});

test('sendMailWithFailover automatically fails over from port 587 to port 465 on timeout', async () => {
  const { sendMailWithFailover } = await import('../backend/src/services/alertService.js');

  const attempts = [];
  const mockCreateTransport = (opts) => {
    attempts.push(opts.port);
    return {
      sendMail: async (mail) => {
        if (opts.port === 587) {
          const timeoutErr = new Error('Connection timeout');
          timeoutErr.code = 'ETIMEDOUT';
          throw timeoutErr;
        }
        return { accepted: [mail.to], messageId: 'msg-465' };
      },
    };
  };

  const testEnv = {
    SMTP_HOST: 'smtp-relay.brevo.com',
    SMTP_PORT: '587',
    SMTP_USER: 'test@example.com',
    SMTP_PASS: 'secret',
    ALERT_FROM: 'Notice Me <test@example.com>',
  };

  const res = await sendMailWithFailover(
    { to: 'recipient@example.com', text: 'Test alert' },
    { env: testEnv, createTransport: mockCreateTransport }
  );

  assert.equal(res.messageId, 'msg-465');
  assert.deepEqual(attempts, [587, 465], 'Should first attempt configured port 587 then failover to port 465');
});

test('safeParseJson correctly repairs truncated nested array-of-objects JSON', async () => {
  const { safeParseJson } = await import('../scripts/gemini-client.js');

  const truncated = '```json\n{ "headline": "Exam date extended", "evidence": [ { "title": "Portal", "url": "https://gov.in"';
  const parsed = safeParseJson(truncated);

  assert.ok(parsed);
  assert.equal(parsed.headline, 'Exam date extended');
  assert.equal(parsed.evidence[0].title, 'Portal');
  assert.equal(parsed.evidence[0].url, 'https://gov.in');
});

test('filterEligibleTopics allows topics with unalerted diffs to retry on subsequent hours', async () => {
  const { filterEligibleTopics } = await import('../backend/src/services/cronService.js');

  const topicWithPendingDiff = {
    id: 't-1',
    alertEnabled: true,
    alertEmail: 'user@example.com',
    alertHour: 14, // Scheduled for 14:00
    alertFrequency: '1d',
    timezone: 'Asia/Kolkata',
    lastAlertedAt: '2026-10-08T14:00:00Z', // 2 days ago
    diffs: [{ id: 'd-1', alerted: false }], // Waiting diff
  };

  // Run at hour 17 on Friday (3 hours after scheduled 14:00 due to earlier timeout/restart)
  const eligible = filterEligibleTopics([topicWithPendingDiff], new Date('2026-10-09T11:30:00Z'), { targetHour: 17 });
  assert.equal(eligible.length, 1, 'Topic with pending unalerted diff should be eligible for retry on later hour');
});

test('isRecipientAccepted normalizes case, removes angle brackets, and validates messageId', async () => {
  const { isRecipientAccepted } = await import('../backend/src/services/alertService.js');

  // Case normalization
  assert.equal(isRecipientAccepted({ accepted: ['john.doe@example.com'] }, 'John.Doe@Example.COM'), true);
  // Angle bracket stripping
  assert.equal(isRecipientAccepted({ accepted: ['<john.doe@example.com>'] }, 'john.doe@example.com'), true);
  // MessageId fallback without rejection
  assert.equal(isRecipientAccepted({ messageId: 'msg-123', rejected: [] }, 'john.doe@example.com'), true);
  // Rejection check
  assert.equal(isRecipientAccepted({ rejected: ['john.doe@example.com'] }, 'john.doe@example.com'), false);
});

test('safeParseJson repairs truncated JSON ending with an incomplete trailing key', async () => {
  const { safeParseJson } = await import('../scripts/gemini-client.js');

  const incompleteKey = '{"headline": "Application extended", "whyItMatters';
  const parsed = safeParseJson(incompleteKey);

  assert.ok(parsed);
  assert.equal(parsed.headline, 'Application extended');
  assert.equal(parsed.whyItMatters, undefined);
});

test('processInitialTopicAlerts reuses recent baseline snapshot to prevent redundant SerpApi search calls', async () => {
  const { processInitialTopicAlerts } = await import('../backend/src/services/cronService.js');

  let serpCalls = 0;
  let sentAlert = null;

  const mockDb = {
    topic: {
      findMany: async () => [{
        id: 't-recent',
        name: 'GATE 2027',
        alertEmail: 'candidate@example.org',
        alertEnabled: true,
        lastAlertedAt: null,
        createdAt: new Date(Date.now() - 10.5 * 60 * 1000), // Exactly crosses 10-minute threshold
      }],
      findUnique: async () => ({
        id: 't-recent',
        name: 'GATE 2027',
        alertEmail: 'candidate@example.org',
        alertEnabled: true,
        lastAlertedAt: null,
        createdAt: new Date(Date.now() - 10.5 * 60 * 1000),
      }),
      update: async () => ({}),
    },
    snapshot: {
      findFirst: async () => ({
        id: 'snap-1',
        topicId: 't-recent',
        pulledAt: new Date(Date.now() - 11 * 60 * 1000), // Baseline was pulled 11 min ago at creation
        rawData: { search: [{ title: 'GATE Notification', link: 'https://gate.iit.ac.in' }], news: [] },
      }),
    },
    diff: {
      findUnique: async () => null,
    },
  };

  const mockClient = {
    pullSnapshot: async () => {
      serpCalls++;
      return { search: [], news: [] };
    },
  };

  const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

  const res = await processInitialTopicAlerts({
    db: mockDb,
    client: mockClient,
    logger: silentLogger,
    minAgeMs: 10 * 60 * 1000,
  });

  assert.equal(serpCalls, 0, 'Should reuse recent snapshot without invoking SerpApi pullSnapshot');
  assert.equal(res.checked, 1);
});
