import { getDb } from './db.js';
import { createSerpApiClient } from '../../../scripts/serpapi-client.js';
import { diff } from '../../../scripts/diff-engine.js';
import { getGeminiClient } from './geminiService.js';
import * as alertService from './alertService.js';

const activeTopicSyncs = new Set();

export function isTopicSyncing(topicId) {
  return activeTopicSyncs.has(topicId);
}

/**
 * Pulls a fresh snapshot for a single topic, diffs against the previous snapshot,
 * saves new snapshots/diffs, and triggers an alert if configured and changes were found.
 */
export async function syncTopic(topicId, database = getDb, customClient = null, customGemini = undefined, options = {}) {
  const { skipAlert = false, bypassLock = false } = options;

  if (!bypassLock && activeTopicSyncs.has(topicId)) {
    const err = new Error(`A sync is already in progress for topic ${topicId}.`);
    err.status = 409;
    throw err;
  }
  activeTopicSyncs.add(topicId);

  try {
    const db = typeof database === 'function' ? database() : database;
    const topic = await db.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new Error('Topic not found.');

    const client = customClient || createSerpApiClient();
    const rawData = await client.pullSnapshot(topic.query);
    if (!rawData?.search?.length || !rawData?.news?.length) {
      throw new Error('Refusing an empty or partial snapshot from search provider.');
    }

    const gemini = customGemini !== undefined ? customGemini : getGeminiClient();
    if (gemini) {
      try {
        const aiBriefing = await gemini.generateBriefing(topic, rawData);
        if (aiBriefing) rawData.aiBriefing = aiBriefing;
      } catch (err) {
        console.warn('Gemini briefing generation skipped:', err.message);
      }
    }

    const { snapshot, change, isBaseline } = await db.$transaction(async (tx) => {
      const previous = await tx.snapshot.findFirst({
        where: { topicId: topic.id },
        orderBy: [{ pulledAt: 'desc' }, { id: 'desc' }],
      });

      const current = await tx.snapshot.create({
        data: {
          topicId: topic.id,
          rawData,
          pulledAt: new Date(rawData.pulledAt || Date.now()),
        },
      });

      // Prune snapshots beyond retention limit
      const retentionLimit = Number(process.env.SNAPSHOT_RETENTION_LIMIT || 20);
      if (typeof tx.snapshot.findMany === 'function' && typeof tx.snapshot.deleteMany === 'function') {
        try {
          const excess = await tx.snapshot.findMany({
            where: { topicId: topic.id },
            orderBy: [{ pulledAt: 'desc' }, { id: 'desc' }],
            skip: retentionLimit,
            select: { id: true },
          });
          if (excess && excess.length > 0) {
            await tx.snapshot.deleteMany({
              where: { id: { in: excess.map((s) => s.id) } },
            });
          }
        } catch {
          // Non-critical retention pruning failure
        }
      }

      if (!previous) {
        return { snapshot: current, change: null, isBaseline: true };
      }

      const result = await diff(previous, current);
      if (!result?.summary || !result?.sourceUrls?.length) {
        return { snapshot: current, change: null, isBaseline: false };
      }

      let diffSummary = result.summary;
      if (gemini) {
        try {
          const humanSummary = await gemini.generateDiffSummary(topic, {
            previous: previous.rawData,
            current: rawData,
            rawSummary: result.summary,
          });
          if (humanSummary) diffSummary = humanSummary;
        } catch (err) {
          console.warn('Gemini diff explanation skipped:', err.message);
        }
      }

      const createdDiff = await tx.diff.create({
        data: {
          topicId: topic.id,
          summary: diffSummary,
          sourceUrls: result.sourceUrls,
          alerted: false,
        },
      });

      return { snapshot: current, change: createdDiff, isBaseline: false };
    }, { isolationLevel: 'Serializable' });

    if (!skipAlert && change && topic.alertEnabled && topic.alertEmail) {
      try {
        await alertService.sendDiffAlert(topic, change);
        await db.diff.update({ where: { id: change.id }, data: { alerted: true } });
        await db.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: new Date() } });
      } catch (alertErr) {
        console.warn(`Alert delivery failed for topic ${topic.id}:`, alertErr.message);
      }
    }

    return { topic, snapshot, diff: change, isBaseline };
  } finally {
    activeTopicSyncs.delete(topicId);
  }
}
