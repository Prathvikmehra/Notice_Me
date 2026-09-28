/** SerpApi ingestion; output follows docs/snapshot-format.md. */
const QUOTA_ERROR = /quota|rate.?limit|too many requests|run out of searches|(?:search|request|credit).*?(?:exhaust|limit|exceed)|(?:exhaust|exceed).*?(?:search|request|credit)|no (?:more )?(?:searches|credits)/i;

function text(value, field, { optional = false } = {}) {
  if (optional && value == null) return '';
  if (typeof value !== 'string' || (!optional && !value.trim())) {
    throw new Error(`SerpApi returned an invalid ${field}.`);
  }
  return value.replace(/\s+/g, ' ').trim();
}

function link(value) {
  const result = text(value, 'link');
  try {
    const url = new URL(result);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('SerpApi returned an invalid source URL.');
  }
  return result;
}

function results(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`SerpApi returned empty or missing ${field}; refusing a partial snapshot.`);
  }
  return value;
}

export function trimSearch(response) {
  return results(response?.organic_results, 'organic_results').slice(0, 10).map((item) => {
    if (!Number.isInteger(item?.position) || item.position < 1) {
      throw new Error('SerpApi returned an invalid search position.');
    }
    return {
      position: item.position,
      title: text(item.title, 'search title'),
      link: link(item.link),
      snippet: text(item.snippet, 'search snippet', { optional: true }),
      date: item.date == null ? null : text(item.date, 'search date'),
    };
  });
}

export function trimNews(response) {
  // Google News returns both individual articles and groups of stories.
  const articles = results(response?.news_results, 'news_results').flatMap((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('SerpApi returned an invalid news result.');
    }
    if (item.highlight !== undefined || item.stories !== undefined) {
      if (item.stories !== undefined && !Array.isArray(item.stories)) {
        throw new Error('SerpApi returned invalid grouped news stories.');
      }
      const group = [
        ...(item.link ? [item] : []),
        ...(item.highlight ? [item.highlight] : []),
        ...(item.stories ?? []),
      ];
      return results(group, 'grouped news stories');
    }
    return [item];
  });
  return results(articles, 'news articles').slice(0, 10).map((item) => ({
    title: text(item?.title, 'news title'),
    link: link(item?.link),
    source: text(typeof item?.source === 'string' ? item.source : item?.source?.name, 'news source'),
    date: text(item?.date, 'news date'),
    // Google News frequently omits descriptions; preserve that as an empty string.
    snippet: text(item?.snippet, 'news snippet', { optional: true }),
  }));
}

/** Keep exhausted keys out of subsequent requests during this run. */
export function createSerpApiClient({ env = process.env, fetchImpl = globalThis.fetch, logger = console } = {}) {
  const keys = Array.from({ length: 5 }, (_, i) => ({ index: i + 1, key: env[`SERPAPI_KEY_${i + 1}`]?.trim() }))
    .filter(({ key }) => key);
  if (!keys.length) throw new Error('Configure at least one of SERPAPI_KEY_1..5.');
  let keyOffset = 0;
  const usage = keys.map(({ index }) => ({ keyIndex: index, attempts: 0, successfulResponses: 0 }));

  async function request(engine, query) {
    text(query, 'query');
    while (keyOffset < keys.length) {
      const { index, key } = keys[keyOffset];
      const url = new URL('https://serpapi.com/search.json');
      url.search = new URLSearchParams({ engine, q: query, api_key: key, hl: 'en', gl: 'in' });
      logger.info(`SerpApi ${engine}: using key index ${index}.`);
      const counter = usage[keyOffset];
      counter.attempts += 1;
      let response;
      try {
        response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
      } catch {
        // Never include raw fetch errors: they can contain the URL and API key.
        throw new Error(`SerpApi ${engine} request failed or timed out using key index ${index}.`);
      }
      if (response.status === 429) {
        await response.body?.cancel();
        logger.warn(`SerpApi key index ${index} rate limited; trying the next key.`);
        keyOffset += 1;
        continue;
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`SerpApi ${engine} returned invalid JSON (HTTP ${response.status}).`);
      }
      if (typeof payload?.error === 'string' && QUOTA_ERROR.test(payload.error)) {
        logger.warn(`SerpApi key index ${index} quota exhausted; trying the next key.`);
        keyOffset += 1;
        continue;
      }
      if (!response.ok || !payload || payload.error ||
          (payload.search_metadata?.status && payload.search_metadata.status !== 'Success')) {
        throw new Error(`SerpApi ${engine} failed using key index ${index} (HTTP ${response.status}); no snapshot saved.`);
      }
      counter.successfulResponses += 1;
      return payload;
    }
    throw new Error('All configured SerpApi keys are rate limited or out of quota (SERPAPI_KEY_1..5).');
  }

  async function googleSearch(query) {
    return trimSearch(await request('google', query));
  }

  async function googleNews(query) {
    return trimNews(await request('google_news', query));
  }

  async function pullSnapshot(query) {
    // Sequential pulls also let News reuse the working key selected by Search.
    const search = await googleSearch(query);
    const news = await googleNews(query);
    return { query, pulledAt: new Date().toISOString(), search, news };
  }

  return { googleSearch, googleNews, pullSnapshot, getUsage: () => usage.map((counter) => ({ ...counter })) };
}
