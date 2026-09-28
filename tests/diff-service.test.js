import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTimeline } from '../backend/src/services/diffService.js';

describe('diffService', () => {
  test('getTimeline returns diffs ordered newest first', async () => {
    const mockDiffs = [
      {
        id: 'diff-2',
        topicId: 'topic-1',
        summary: 'Changed on pmkisan.gov.in: Income limit ₹2L → Income limit ₹2.5L',
        sourceUrls: ['https://pmkisan.gov.in/guidelines.pdf'],
        detectedAt: new Date('2026-09-28T06:00:00Z'),
        alerted: true
      },
      {
        id: 'diff-1',
        topicId: 'topic-1',
        summary: 'New result: PM-KISAN Operational Guidelines',
        sourceUrls: ['https://pmkisan.gov.in/guidelines.pdf'],
        detectedAt: new Date('2026-09-25T06:00:00Z'),
        alerted: true
      }
    ];

    let capturedQuery = null;

    const mockPrisma = {
      diff: {
        findMany: async (query) => {
          capturedQuery = query;
          return mockDiffs;
        }
      }
    };

    const result = await getTimeline('topic-1', mockPrisma);

    assert.deepEqual(capturedQuery, {
      where: { topicId: 'topic-1' },
      orderBy: { detectedAt: 'desc' }
    });
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'diff-2');
    assert.equal(result[1].id, 'diff-1');
  });

  test('getTimeline returns empty array if topicId is missing', async () => {
    const result = await getTimeline('');
    assert.deepEqual(result, []);
  });
});
