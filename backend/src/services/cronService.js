import cron from 'node-cron';
import { getDb } from './db.js';
import { createSerpApiClient } from '../../../scripts/serpapi-client.js';
import { diff } from '../../../scripts/diff-engine.js';
import * as alertService from './alertService.js';

export function getLocalTimeDetails(timeZone = 'Asia/Kolkata') {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: 'numeric',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const isWeekend = ['Sat', 'Sun'].includes(weekday);
  return { hour, weekday, isWeekend };
}

export async function processDueTopics({ db, client, logger = console }) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) {
    throw new Error('Database client with topic model is required');
  }

  const { hour: currentHour, isWeekend } = getLocalTimeDetails('Asia/Kolkata');

  // Query topics where alerts are enabled and scheduled for current hour
  const candidates = await activeDb.topic.findMany({
    where: {
      alertEnabled: true,
      alertEmail: { not: null },
      alertHour: currentHour,
    },
  });

  const topics = candidates.filter((t) => {
    if (t.alertDays === 'weekdays' && isWeekend) return false;
    return true;
  });

  if (topics.length === 0) return { checked: 0, alerted: 0 };

  logger.info(`Cron: running hourly check for ${topics.length} topic(s) scheduled at ${currentHour}:00 IST.`);
  let alertedCount = 0;

  for (const topic of topics) {
    try {
      const rawData = await client.pullSnapshot(topic.query);
      if (!rawData?.search?.length || !rawData?.news?.length) continue;

      const change = await activeDb.$transaction(async (tx) => {
        const previous = await tx.snapshot.findFirst({
          where: { topicId: topic.id },
          orderBy: [{ pulledAt: 'desc' }, { id: 'desc' }],
        });
        const current = await tx.snapshot.create({
          data: { topicId: topic.id, rawData, pulledAt: new Date(rawData.pulledAt) },
        });
        if (!previous) return null;
        const result = await diff(previous, current);
        if (!result?.summary || !result?.sourceUrls?.length) return null;
        return tx.diff.create({
          data: { topicId: topic.id, summary: result.summary, sourceUrls: result.sourceUrls, alerted: false },
        });
      }, { isolationLevel: 'Serializable' });

      if (change) {
        await alertService.sendDiffAlert(topic, change);
        await activeDb.diff.update({ where: { id: change.id }, data: { alerted: true } });
        await activeDb.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: new Date() } });
        alertedCount++;
      }
    } catch (err) {
      logger.error(`Cron: error processing topic ${topic.id}: ${err.message}`);
    }
  }

  return { checked: topics.length, alerted: alertedCount };
}

export function startCronScheduler(database = getDb, { client, enabled = true, logger = console } = {}) {
  if (!enabled) return null;
  const dbProvider = database || getDb;
  const apiClient = client || createSerpApiClient();
  // Runs at minute 0 of every hour
  const task = cron.schedule('0 * * * *', async () => {
    try {
      await processDueTopics({ db: typeof dbProvider === 'function' ? dbProvider() : dbProvider, client: apiClient, logger });
    } catch (err) {
      logger.error(`Cron scheduler failure: ${err.message}`);
    }
  });
  logger.info('Cron scheduler initialized (runs top of every hour: 0 * * * *).');
  return task;
}
