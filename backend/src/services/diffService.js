import { getDb } from './db.js';

/**
 * Retrieves timeline diffs for a topic, sorted newest first, with optional pagination.
 * 
 * @param {string} topicId - The ID of the topic.
 * @param {object} [client] - Optional Prisma client instance.
 * @param {object} [options] - Optional pagination parameters ({ limit, offset }).
 * @returns {Promise<Array<object>>} - List of Diff records sorted by detectedAt descending.
 */
export async function getTimeline(topicId, client = null, options = {}) {
  if (!topicId) {
    return [];
  }

  const db = client || getDb();
  const query = {
    where: { topicId },
    orderBy: {
      detectedAt: 'desc',
    },
  };

  if (options?.limit !== undefined) {
    query.take = Math.min(Math.max(1, Number(options.limit) || 50), 100);
  }
  if (options?.offset !== undefined) {
    query.skip = Math.max(0, Number(options.offset) || 0);
  }

  return await db.diff.findMany(query);
}
