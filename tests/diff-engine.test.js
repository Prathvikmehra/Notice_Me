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

  test('boundary rank churn at rank 10/11 on full 10-result window is suppressed as false positive', () => {
    // Generate 10 search results
    const prevSearch = Array.from({ length: 10 }, (_, i) => ({
      position: i + 1,
      title: `Result Title #${i + 1}`,
      link: `https://example.gov.in/page-${i + 1}`,
      snippet: `Snippet content for result ${i + 1}`,
    }));

    // In current pull, ranks 1-9 are identical, but rank 10 swapped with rank 11
    const currSearch = [
      ...prevSearch.slice(0, 9),
      {
        position: 10,
        title: 'New Result Title #10 (Swapped with #11)',
        link: 'https://example.gov.in/page-11-entering-10',
        snippet: 'Snippet content for entering result',
      },
    ];

    const result = diff({ search: prevSearch, news: [] }, { search: currSearch, news: [] });
    // Pure boundary churn at rank 10 in a full 10-result list must return null
    assert.equal(result, null);
  });

  test('high-rank insertion at rank 1 reports new result without confusing displaced rank-10 removal', () => {
    const prevSearch = Array.from({ length: 10 }, (_, i) => ({
      position: i + 1,
      title: `Result Title #${i + 1}`,
      link: `https://example.gov.in/page-${i + 1}`,
      snippet: `Snippet content for result ${i + 1}`,
    }));

    const breakingNewsItem = {
      position: 1,
      title: 'BREAKING: Official Exam Notification Released',
      link: 'https://gov.in/breaking-news-exam',
      snippet: 'Official notification released today.',
    };

    // New item at rank 1, previous items shifted down, rank 10 falls off to rank 11
    const currSearch = [
      breakingNewsItem,
      ...prevSearch.slice(0, 9).map((item, idx) => ({ ...item, position: idx + 2 })),
    ];

    const result = diff({ search: prevSearch, news: [] }, { search: currSearch, news: [] });
    assert.notEqual(result, null);
    // Reports the real new breaking result
    assert.ok(result.summary.includes('New result: BREAKING: Official Exam Notification Released'));
    // Suppresses false "Removed result: Result Title #10" because it was merely displaced to rank 11
    assert.ok(!result.summary.includes('Removed result: Result Title #10'));
  });
});
