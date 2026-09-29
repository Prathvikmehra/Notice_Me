import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeminiKeys, createGeminiClient } from '../scripts/gemini-client.js';

test('parseGeminiKeys extracts and deduplicates keys from environment variables', () => {
  const env = {
    GEMINI_API_KEYS: 'key-alpha, key-beta ',
    GEMINI_API_KEY_1: 'key-alpha', // duplicate should be ignored
    GEMINI_API_KEY_2: 'key-gamma',
    GEMINI_API_KEY: 'key-delta',
  };
  const keys = parseGeminiKeys(env);
  assert.deepEqual(keys, ['key-alpha', 'key-beta', 'key-gamma', 'key-delta']);
});

test('createGeminiClient rotates on HTTP 429 and succeeds on next key', async () => {
  let callCount = 0;
  const mockFetch = async (url) => {
    callCount++;
    if (url.includes('key-fail')) {
      return { status: 429, ok: false, json: async () => ({ error: { message: 'Quota exceeded', code: 429 } }) };
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                coreStatus: 'Verified status confirmed for exam schedule.',
                keyPoints: [{ badge: 'EXAM', text: 'Admit card active' }],
                deadlines: [{ title: 'Admit card release', date: '2026-03-10', urgency: 'HIGH' }],
                actionRequired: 'Download hall ticket before exam date.',
              }),
            }],
          },
        }],
      }),
    };
  };

  const client = createGeminiClient({
    keys: ['key-fail', 'key-success'],
    fetchImpl: mockFetch,
    logger: { warn: () => {} },
  });

  const topic = { name: 'UPSC CSE 2026', query: 'UPSC CSE 2026 Prelims', category: 'exam' };
  const briefing = await client.generateBriefing(topic, {
    search: [{ title: 'UPSC CSE 2026', link: 'https://upsc.gov.in', snippet: 'Admit cards out' }],
    news: [],
  });

  assert.equal(callCount, 2); // rotated after first failed
  assert.equal(briefing.coreStatus, 'Verified status confirmed for exam schedule.');
  assert.equal(briefing.keyPoints.length, 1);
  assert.equal(briefing.deadlines[0].urgency, 'HIGH');
  assert.equal(briefing.actionRequired, 'Download hall ticket before exam date.');
  assert.equal(briefing.tag, 'AI VERIFIED INTELLIGENCE BRIEFING');
});

test('createGeminiClient diff summary synthesis and graceful fallback on empty keys', async () => {
  const emptyClient = createGeminiClient({ keys: [] });
  const topic = { name: 'Scheme', query: 'Scheme updates' };

  // Empty client gracefully returns rawSummary and null briefing
  const noBriefing = await emptyClient.generateBriefing(topic, { search: [] });
  assert.equal(noBriefing, null);

  const fallbackSummary = await emptyClient.generateDiffSummary(topic, { rawSummary: 'Fallback diff string' });
  assert.equal(fallbackSummary, 'Fallback diff string');

  // Working client generates natural explanation
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      candidates: [{
        content: {
          parts: [{ text: 'Application window extended by 7 days until November 15.' }],
        },
      }],
    }),
  });

  const activeClient = createGeminiClient({
    keys: ['test-key'],
    fetchImpl: mockFetch,
    logger: { warn: () => {} },
  });

  const summary = await activeClient.generateDiffSummary(topic, {
    rawSummary: 'Snippet changed',
    previous: { search: [] },
    current: { search: [] },
  });
  assert.equal(summary, 'Application window extended by 7 days until November 15.');
});
