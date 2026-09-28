let prismaInstance = null;

async function getDefaultPrisma() {
  if (!prismaInstance) {
    const { PrismaClient } = await import('@prisma/client');
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

/**
 * Retrieves timeline diffs for a topic, sorted newest first.
 * 
 * @param {string} topicId - The ID of the topic.
 * @param {object} [client] - Optional Prisma client instance (useful for dependency injection in tests).
 * @returns {Promise<Array<object>>} - List of Diff records sorted by detectedAt descending.
 */
export async function getTimeline(topicId, client = null) {
  if (!topicId) {
    return [];
  }

  const db = client || (await getDefaultPrisma());

  return await db.diff.findMany({
    where: { topicId },
    orderBy: {
      detectedAt: 'desc'
    }
  });
}

export default { getTimeline };
