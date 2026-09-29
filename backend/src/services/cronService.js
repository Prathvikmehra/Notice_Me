import cron from 'node-cron';
import { getDb } from './db.js';
import { createSerpApiClient } from '../../../scripts/serpapi-client.js';
import { diff } from '../../../scripts/diff-engine.js';
import { syncTopic } from './topicSyncService.js';
import * as alertService from './alertService.js';

export function getLocalTimeDetails(timeZone = 'Asia/Kolkata', now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: 'numeric',
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? 1);
  const dayOfMonth = Number(parts.find((p) => p.type === 'day')?.value ?? 1);
  const isWeekend = ['Sat', 'Sun'].includes(weekday);
  return { hour, weekday, month, dayOfMonth, isWeekend };
}

export function isSameDay(date1, date2, timeZone = 'Asia/Kolkata') {
  if (!date1 || !date2) return false;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(new Date(date1)) === formatter.format(new Date(date2));
  } catch {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }
}

export function getCalendarDaysDiff(date1, date2, timeZone = 'Asia/Kolkata') {
  if (!date1 || !date2) return 999;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const d1Str = formatter.format(new Date(date1));
    const d2Str = formatter.format(new Date(date2));
    const [y1, m1, day1] = d1Str.split('-').map(Number);
    const [y2, m2, day2] = d2Str.split('-').map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, day1);
    const utc2 = Date.UTC(y2, m2 - 1, day2);
    return Math.floor((utc2 - utc1) / (24 * 60 * 60 * 1000));
  } catch {
    const msDiff = new Date(date2) - new Date(date1);
    return Math.floor(msDiff / (24 * 60 * 60 * 1000));
  }
}

export function parseFrequencyToDays(freqStr) {
  if (!freqStr) return 1;
  const str = String(freqStr).trim().toLowerCase();
  if (['daily', '1d'].includes(str)) return 1;
  if (['weekly', '7d', '1w'].includes(str)) return 7;
  if (['biweekly', 'bi-weekly', '14d', '2w'].includes(str)) return 14;
  if (['monthly', '30d', '1m'].includes(str)) return 30;
  if (['1h', '3h'].includes(str)) return 1;
  const match = str.match(/^(\d+)\s*(d|days?|w|weeks?|m|months?|h|hours?)?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'd').charAt(0).toLowerCase();
    if (unit === 'd') return Math.max(1, val);
    if (unit === 'w') return Math.max(1, val * 7);
    if (unit === 'm') return Math.max(1, val * 30);
    if (unit === 'h') return Math.max(1, Math.round(val / 24));
  }
  return null;
}

/**
 * Checks topics whose scheduled alert is due.
 * Supports:
 * - Dynamic frequencies: daily (1d), every 2-3 days, weekly (7d), bi-weekly (14d), monthly (30d), custom days
 * - Specific weekdays (e.g. 'tue' for Every Tuesday)
 * - Weekdays ('weekdays') or Every day ('all')
 * - Topics that already received an alert today are skipped until at least tomorrow.
 */
export async function processDueTopics({ db, client, logger = console, now = new Date() }) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) {
    throw new Error('Database client with topic model is required');
  }

  const { hour: currentHour, weekday, month, dayOfMonth, isWeekend } = getLocalTimeDetails('Asia/Kolkata', now);
  const currentWeekday = weekday.toLowerCase();

  // Query topics where alerts are enabled and scheduled for current hour
  const candidates = await activeDb.topic.findMany({
    where: {
      alertEnabled: true,
      alertEmail: { not: null },
      alertHour: currentHour,
    },
  });

  const topics = candidates.filter((t) => {
    const tz = t.timezone || 'Asia/Kolkata';
    const daySetting = String(t.alertDays || 'weekdays').toLowerCase().trim();
    const freq = String(t.alertFrequency || '1d').toLowerCase().trim();
    const isMonthly = freq === 'monthly' || freq === '30d' || freq === '1m';

    // 1. Day / Date check
    if (isMonthly || /^(?:[1-9]|[12][0-9]|30)$/.test(daySetting)) {
      const targetDay = Number(daySetting);
      if (targetDay >= 1 && targetDay <= 30) {
        if (month === 2) {
          // In February, target dates 28, 29, 30 are delivered on the 28th
          if (targetDay >= 28) {
            if (dayOfMonth !== 28) return false;
          } else {
            if (targetDay !== dayOfMonth) return false;
          }
        } else {
          if (targetDay !== dayOfMonth) return false;
        }
      }
    } else {
      if (daySetting === 'weekdays' && isWeekend) return false;
      if (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(daySetting)) {
        if (daySetting !== currentWeekday) return false;
      }
    }

    // 2. Interval & frequency check
    if (t.lastAlertedAt) {
      const daysDiff = getCalendarDaysDiff(t.lastAlertedAt, now, tz);
      // Already alerted today: skip until at least tomorrow
      if (daysDiff < 1) return false;

      if (isMonthly) {
        if (daysDiff < 20) return false;
      } else {
        const requiredDays = parseFrequencyToDays(freq);
        if (daysDiff < requiredDays) return false;
      }
    }
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

/**
 * Checks newly created topics that reached the 10-minute mark without receiving their first alert.
 * Pulls fresh data, computes diff, sends email (diff alert or initial briefing), and marks lastAlertedAt.
 */
export async function processInitialTopicAlerts({ db, client, logger = console, minAgeMs = Number(process.env.INITIAL_ALERT_DELAY_MS || 10 * 60 * 1000) } = {}) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) return { checked: 0, alerted: 0 };

  let pending = [];
  try {
    pending = await activeDb.topic.findMany({
      where: {
        alertEmail: { not: null },
        lastAlertedAt: null,
      },
    });
  } catch {
    return { checked: 0, alerted: 0 };
  }

  const eligible = pending.filter((t) => {
    if (!t.alertEmail || t.lastAlertedAt) return false;
    const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    return Date.now() - created >= minAgeMs;
  });

  if (eligible.length === 0) return { checked: 0, alerted: 0 };

  const apiClient = client || createSerpApiClient();
  logger.info(`Cron: running 10-minute initial alert check for ${eligible.length} new topic(s).`);
  let alertedCount = 0;

  for (const topic of eligible) {
    try {
      const syncResult = await syncTopic(topic.id, activeDb, apiClient);
      if (!syncResult.diff && alertService.isAlertConfigured()) {
        await alertService.sendInitialAlert(topic, syncResult.snapshot);
      }
      await activeDb.topic.update({
        where: { id: topic.id },
        data: { lastAlertedAt: new Date() },
      });
      alertedCount++;
    } catch (err) {
      logger.error(`Cron: error during 10-min initial alert for topic ${topic.id}: ${err.message}`);
    }
  }

  return { checked: eligible.length, alerted: alertedCount };
}

export function startCronScheduler(database = getDb, { client, enabled = true, logger = console } = {}) {
  if (!enabled) return null;
  const dbProvider = database || getDb;
  const apiClient = client || createSerpApiClient();

  // Hourly schedule: checks scheduled daily alerts
  const hourlyTask = cron.schedule('0 * * * *', async () => {
    try {
      await processDueTopics({ db: typeof dbProvider === 'function' ? dbProvider() : dbProvider, client: apiClient, logger });
    } catch (err) {
      logger.error(`Cron scheduler failure: ${err.message}`);
    }
  });

  // Minute ticker: checks newly created topics that crossed the 10-minute threshold
  const initialTicker = cron.schedule('* * * * *', async () => {
    try {
      await processInitialTopicAlerts({ db: typeof dbProvider === 'function' ? dbProvider() : dbProvider, client: apiClient, logger });
    } catch (err) {
      logger.error(`Initial alert ticker failure: ${err.message}`);
    }
  });

  logger.info('Cron scheduler initialized (hourly alerts: 0 * * * *, 10-min initial checks: * * * * *).');

  return {
    stop: () => {
      hourlyTask.stop();
      initialTicker.stop();
    },
  };
}
