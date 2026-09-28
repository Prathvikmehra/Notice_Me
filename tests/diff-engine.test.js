import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diff } from '../scripts/diff-engine.js';

describe('diff-engine', () => {
  // Fixture base items
  const itemA = {
    position: 1,
    title: 'PM-KISAN Operational Guidelines',
    link: 'https://pmkisan.gov.in/guidelines.pdf',
    snippet: 'Income limit ₹2L for eligible farmers.',
    date: 'Sep 10, 2026'
  };

  const itemB = {
    position: 2,
    title: 'PM-KISAN FAQ & Registration',
    link: 'https://agricoop.nic.in/faq',
    snippet: 'Mandatory Aadhaar authentication required.',
    date: 'Sep 12, 2026'
  };

  const newsItemA = {
    title: 'Centre releases new welfare guidelines',
    link: 'https://thehindu.com/news/national/pm-kisan-update',
    source: 'The Hindu',
    date: '1 day ago',
    snippet: 'Verification norms revised across all districts.'
  };

  test('first snapshot (previous is null returns null)', () => {
    const current = {
      query: 'PM-KISAN',
      pulledAt: '2026-09-28T06:00:00.000Z',
      search: [itemA, itemB],
      news: [newsItemA]
    };

    assert.equal(diff(null, current), null);
    assert.equal(diff(undefined, current), null);
  });

  test('no change returns null', () => {
    const previous = {
      query: 'PM-KISAN',
      pulledAt: '2026-09-28T00:00:00.000Z',
      search: [itemA, itemB],
      news: [newsItemA]
    };

    const current = {
      query: 'PM-KISAN',
      pulledAt: '2026-09-28T06:00:00.000Z',
      search: [{ ...itemA }, { ...itemB }],
      news: [{ ...newsItemA }]
    };

    const result = diff(previous, current);
    assert.equal(result, null);
  });

  test('reorder only is ignored and returns null', () => {
    const previous = {
      search: [
        { ...itemA, position: 1 },
        { ...itemB, position: 2 }
      ],
      news: []
    };

    // Swapped order and swapped positions
    const current = {
      search: [
        { ...itemB, position: 1 },
        { ...itemA, position: 2 }
      ],
      news: []
    };

    const result = diff(previous, current);
    assert.equal(result, null);
  });

  test('new result is reported', () => {
    const previous = {
      search: [itemA],
      news: []
    };

    const newItem = {
      position: 2,
      title: 'Cabinet Approves Revised Outlay',
      link: 'https://pib.gov.in/press-release-123',
      snippet: 'Budget increased for income transfer scheme.',
      date: 'Sep 28, 2026'
    };

    const current = {
      search: [itemA, newItem],
      news: []
    };

    const result = diff(previous, current);
    assert.notEqual(result, null);
    assert.ok(result.summary.includes('New result: Cabinet Approves Revised Outlay'));
    assert.deepEqual(result.sourceUrls, ['https://pib.gov.in/press-release-123']);
  });

  test('removed result is reported', () => {
    const previous = {
      search: [itemA, itemB],
      news: []
    };

    // itemB removed
    const current = {
      search: [itemA],
      news: []
    };

    const result = diff(previous, current);
    assert.notEqual(result, null);
    assert.ok(result.summary.includes('Removed result: PM-KISAN FAQ & Registration'));
    assert.deepEqual(result.sourceUrls, ['https://agricoop.nic.in/faq']);
  });

  test('changed snippet is reported with old → new', () => {
    const previous = {
      search: [
        {
          position: 1,
          title: 'PM-KISAN Guidelines',
          link: 'https://pmkisan.gov.in/guidelines.pdf',
          snippet: 'Income limit ₹2L',
          date: 'Sep 10, 2026'
        }
      ],
      news: []
    };

    const current = {
      search: [
        {
          position: 1,
          title: 'PM-KISAN Guidelines',
          link: 'https://pmkisan.gov.in/guidelines.pdf',
          snippet: 'Income limit ₹2.5L',
          date: 'Sep 10, 2026'
        }
      ],
      news: []
    };

    const result = diff(previous, current);
    assert.notEqual(result, null);
    assert.ok(result.summary.includes('Changed on pmkisan.gov.in: Income limit ₹2L → Income limit ₹2.5L'));
    assert.deepEqual(result.sourceUrls, ['https://pmkisan.gov.in/guidelines.pdf']);
  });

  test('changed title is reported', () => {
    const previous = {
      search: [{ ...itemA, title: 'Draft Notice' }],
      news: []
    };
    const current = {
      search: [{ ...itemA, title: 'Final Notification Released' }],
      news: []
    };

    const result = diff(previous, current);
    assert.notEqual(result, null);
    assert.ok(result.summary.includes('Changed title on pmkisan.gov.in: "Draft Notice" → "Final Notification Released"'));
    assert.deepEqual(result.sourceUrls, ['https://pmkisan.gov.in/guidelines.pdf']);
  });

  test('supports full snapshot wrappers with rawData property', () => {
    const prevSnapshot = {
      id: 'snap-1',
      topicId: 'topic-1',
      rawData: {
        search: [itemA],
        news: []
      }
    };

    const currSnapshot = {
      id: 'snap-2',
      topicId: 'topic-1',
      rawData: {
        search: [
          {
            ...itemA,
            snippet: 'Income limit revised to ₹2.5L'
          }
        ],
        news: []
      }
    };

    const result = diff(prevSnapshot, currSnapshot);
    assert.notEqual(result, null);
    assert.ok(result.summary.includes('Changed on pmkisan.gov.in: Income limit ₹2L for eligible farmers. → Income limit revised to ₹2.5L'));
    assert.deepEqual(result.sourceUrls, ['https://pmkisan.gov.in/guidelines.pdf']);
  });
});
