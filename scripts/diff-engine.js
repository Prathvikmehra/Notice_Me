/**
 * Diff comparison engine for Notice Me
 * Compares previous and current snapshots by result URL.
 * Surfaces only material changes (new links, removed links, altered content) while ignoring rank reordering.
 */

/**
 * Extracts raw data payload from a snapshot object or direct rawData object.
 * @param {object|null} snapshot
 * @returns {object|null}
 */
function extractData(snapshot) {
  if (!snapshot) return null;
  return snapshot.rawData || snapshot;
}

/**
 * Normalizes and extracts items from a snapshot payload.
 * Supports { search: [], news: [] }, single arrays, or custom shapes.
 * @param {object|null} snapshot
 * @returns {Array<object>}
 */
function getItems(snapshot) {
  const data = extractData(snapshot);
  if (!data) return [];
  if (Array.isArray(data)) return data;

  const search = Array.isArray(data.search) ? data.search : [];
  const news = Array.isArray(data.news) ? data.news : [];
  return [...search, ...news];
}

/**
 * Extracts a readable site/source name from an item.
 * Prefers explicit item.source, then URL hostname.
 * @param {object} item
 * @returns {string}
 */
function getSite(item) {
  if (item.source && typeof item.source === 'string') {
    return item.source.trim();
  }
  try {
    const parsed = new URL(item.link);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return item.link;
  }
}

/**
 * Builds a Map of items keyed by their trimmed URL.
 * @param {Array<object>} items
 * @returns {Map<string, object>}
 */
function buildItemMap(items) {
  const map = new Map();
  for (const item of items) {
    if (!item || typeof item.link !== 'string') continue;
    const link = item.link.trim();
    if (link && !map.has(link)) {
      map.set(link, item);
    }
  }
  return map;
}

/**
 * Compares two snapshots and returns the material differences.
 * 
 * @param {object|null} previous - Previous snapshot or snapshot.rawData
 * @param {object|null} current - Current snapshot or snapshot.rawData
 * @returns {{ summary: string, sourceUrls: string[] }|null}
 */
export function diff(previous, current) {
  if (!previous || !current) {
    return null;
  }

  const prevItems = getItems(previous);
  const currItems = getItems(current);

  const prevMap = buildItemMap(prevItems);
  const currMap = buildItemMap(currItems);

  const changes = [];
  const sourceUrls = new Set();

  // 1. Detect new links
  for (const [link, currItem] of currMap) {
    if (!prevMap.has(link)) {
      const title = currItem.title ? currItem.title.trim() : link;
      changes.push(`New result: ${title}`);
      sourceUrls.add(link);
    }
  }

  // 2. Detect removed links
  for (const [link, prevItem] of prevMap) {
    if (!currMap.has(link)) {
      const title = prevItem.title ? prevItem.title.trim() : link;
      changes.push(`Removed result: ${title}`);
      sourceUrls.add(link);
    }
  }

  // 3. Detect modifications on the same link (ignoring position reordering)
  for (const [link, currItem] of currMap) {
    if (!prevMap.has(link)) continue;
    const prevItem = prevMap.get(link);
    const site = getSite(currItem) || getSite(prevItem);

    const prevTitle = (prevItem.title || '').trim();
    const currTitle = (currItem.title || '').trim();
    if (prevTitle && currTitle && prevTitle !== currTitle) {
      changes.push(`Changed title on ${site}: "${prevTitle}" → "${currTitle}"`);
      sourceUrls.add(link);
    }

    const prevSnippet = (prevItem.snippet || '').trim();
    const currSnippet = (currItem.snippet || '').trim();
    if (prevSnippet && currSnippet && prevSnippet !== currSnippet) {
      changes.push(`Changed on ${site}: ${prevSnippet} → ${currSnippet}`);
      sourceUrls.add(link);
    }

    const prevDate = (prevItem.date || '').trim();
    const currDate = (currItem.date || '').trim();
    if (prevDate !== currDate && (prevDate || currDate)) {
      changes.push(`Changed date on ${site}: ${prevDate || 'None'} → ${currDate || 'None'}`);
      sourceUrls.add(link);
    }
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    summary: changes.join('\n'),
    sourceUrls: Array.from(sourceUrls)
  };
}

export default { diff };
