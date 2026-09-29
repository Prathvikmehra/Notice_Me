import { getDb } from './db.js';
import { createSerpApiClient } from '../../../scripts/serpapi-client.js';
import { diff } from '../../../scripts/diff-engine.js';
import * as alertService from './alertService.js';

/**
 * Pulls a fresh snapshot for a single topic, diffs against the previous snapshot,
 * saves new snapshots/diffs, and triggers an alert if configured and changes were found.
 */
export async function syncTopic(topicId, database = getDb, customClient = null) {
  const db = typeof database === 'function' ? database() : database;
  const topic = await db.topic.findUnique({ where: { id: topicId } });
  if (!topic) throw new Error('Topic not found.');

  const client = customClient || createSerpApiClient();
  const rawData = await client.pullSnapshot(topic.query);
  if (!rawData?.search?.length || !rawData?.news?.length) {
    throw new Error('Refusing an empty or partial snapshot from search provider.');
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

    if (!previous) {
      return { snapshot: current, change: null, isBaseline: true };
    }

    const result = await diff(previous, current);
    if (!result?.summary || !result?.sourceUrls?.length) {
      return { snapshot: current, change: null, isBaseline: false };
    }

    const createdDiff = await tx.diff.create({
      data: {
        topicId: topic.id,
        summary: result.summary,
        sourceUrls: result.sourceUrls,
        alerted: false,
      },
    });

    return { snapshot: current, change: createdDiff, isBaseline: false };
  }, { isolationLevel: 'Serializable' });

  if (change && topic.alertEnabled && topic.alertEmail) {
    try {
      await alertService.sendDiffAlert(topic, change);
      await db.diff.update({ where: { id: change.id }, data: { alerted: true } });
      await db.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: new Date() } });
    } catch (alertErr) {
      console.warn(`Alert delivery failed for topic ${topic.id}:`, alertErr.message);
    }
  }

  return { topic, snapshot, diff: change, isBaseline };
}
