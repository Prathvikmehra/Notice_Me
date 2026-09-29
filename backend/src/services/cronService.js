import cron from 'node-cron';
import { getDb } from './db.js';
import { createSerpApiClient } from '../../../scripts/serpapi-client.js';
import { diff } from '../../../scripts/diff-engine.js';
import { syncTopic } from './topicSyncService.js';
import { getGeminiClient } from './geminiService.js';
import { refreshTrendingRadar } from './trendingService.js';
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

export function filterEligibleTopics(candidates = [], now = new Date(), targetHour = null) {
  const { hour: currentHour, weekday, month, dayOfMonth, isWeekend } = getLocalTimeDetails('Asia/Kolkata', now);
  const hourToCheck = targetHour !== null && targetHour !== undefined ? targetHour : currentHour;
  const currentWeekday = weekday.toLowerCase();

  return candidates.filter((t) => {
    if (t.alertHour !== undefined && t.alertHour !== null && t.alertHour !== hourToCheck) {
      return false;
    }
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
}

/**
 * Pre-fetch phase (T - 10 minutes, runs at minute 50: `50 * * * *`):
 * Looks ahead to the next hour (e.g. at 3:50 PM, targets 4:00 PM topics).
 * Pulls SerpApi snapshots and generates Gemini summaries ahead of time,
 * saving them with `alerted: false` so that the 4:00 PM dispatch is instantaneous.
 */
export async function prefetchUpcomingTopics({ db, client, gemini, logger = console, now = new Date() } = {}) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) {
    throw new Error('Database client with topic model is required');
  }

  const { hour: currentHour } = getLocalTimeDetails('Asia/Kolkata', now);
  const targetHour = (currentHour + 1) % 24;

  const candidates = await activeDb.topic.findMany({
    where: {
      alertEnabled: true,
      alertEmail: { not: null },
      alertHour: targetHour,
    },
  });

  const topics = filterEligibleTopics(candidates, now, targetHour);
  if (topics.length === 0) return { prefetched: 0, targetHour, total: 0 };

  logger.info(`Cron [Pre-fetch]: Running T-10m data & AI fetch for ${topics.length} topic(s) due at ${targetHour}:00 IST.`);
  const apiClient = client || createSerpApiClient();
  let prefetchedCount = 0;

  for (const topic of topics) {
    try {
      await syncTopic(topic.id, activeDb, apiClient, gemini, { skipAlert: true });
      prefetchedCount++;
    } catch (err) {
      logger.warn(`Cron [Pre-fetch]: error pre-fetching topic ${topic.id}: ${err.message}`);
    }
  }

  logger.info(`Cron [Pre-fetch]: Completed pre-fetch for ${prefetchedCount}/${topics.length} topic(s).`);
  return { prefetched: prefetchedCount, targetHour, total: topics.length };
}

/**
 * Dispatch phase (Runs at minute 0: `0 * * * *`):
 * Dispatches alerts for topics scheduled for the current hour.
 * Sends pre-warmed alerts immediately. If pre-fetch didn't run, executes fallback on-demand.
 */
export async function dispatchDueAlerts({ db, client, gemini, logger = console, now = new Date() } = {}) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) {
    throw new Error('Database client with topic model is required');
  }

  const { hour: currentHour } = getLocalTimeDetails('Asia/Kolkata', now);

  const candidates = await activeDb.topic.findMany({
    where: {
      alertEnabled: true,
      alertEmail: { not: null },
      alertHour: currentHour,
    },
  });

  const topics = filterEligibleTopics(candidates, now, currentHour);
  if (topics.length === 0) return { checked: 0, alerted: 0 };

  logger.info(`Cron [Dispatch]: Delivering scheduled alerts for ${topics.length} topic(s) at ${currentHour}:00 IST.`);
  const apiClient = client || createSerpApiClient();
  let alertedCount = 0;

  for (const topic of topics) {
    try {
      // 1. Look for unalerted diffs (generated by pre-fetch or previous runs)
      const pendingDiff = await activeDb.diff.findFirst({
        where: { topicId: topic.id, alerted: false },
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      });

      if (pendingDiff) {
        await alertService.sendDiffAlert(topic, pendingDiff);
        await activeDb.diff.update({ where: { id: pendingDiff.id }, data: { alerted: true } });
        await activeDb.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: now } });
        alertedCount++;
        continue;
      }

      // 2. Check if a snapshot was already pulled within the last 20 minutes (pre-fetch ran, no changes found)
      const latestSnapshot = await activeDb.snapshot.findFirst({
        where: { topicId: topic.id },
        orderBy: [{ pulledAt: 'desc' }, { id: 'desc' }],
      });

      const snapshotAgeMs = latestSnapshot?.pulledAt ? (now.getTime() - new Date(latestSnapshot.pulledAt).getTime()) : Infinity;
      if (snapshotAgeMs < 20 * 60 * 1000) {
        await activeDb.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: now } });
        continue;
      }

      // 3. Fallback: Pre-fetch didn't run (server restart or newly scheduled). Run syncTopic on-demand.
      const syncResult = await syncTopic(topic.id, activeDb, apiClient, gemini, { skipAlert: false });
      if (syncResult.diff) {
        alertedCount++;
      } else {
        await activeDb.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: now } });
      }
    } catch (err) {
      logger.error(`Cron [Dispatch]: error dispatching alerts for topic ${topic.id}: ${err.message}`);
    }
  }

  logger.info(`Cron [Dispatch]: Finished. Sent ${alertedCount} alert(s) for ${topics.length} topic(s).`);
  return { checked: topics.length, alerted: alertedCount };
}

/**
 * Backwards-compatible alias for existing tests and direct invocations.
 */
export async function processDueTopics(params = {}) {
  return dispatchDueAlerts(params);
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

export function startCronScheduler(database = getDb, { client, gemini, enabled = true, logger = console } = {}) {
  if (!enabled) return null;
  const dbProvider = database || getDb;
  const apiClient = client || createSerpApiClient();
  const geminiClient = gemini !== undefined ? gemini : getGeminiClient();

  // 1. Two-phase pre-fetch (T - 10 min): pulls SerpApi + Gemini at minute 50
  const prefetchTask = cron.schedule('50 * * * *', async () => {
    try {
      await prefetchUpcomingTopics({
        db: typeof dbProvider === 'function' ? dbProvider() : dbProvider,
        client: apiClient,
        gemini: geminiClient,
        logger,
      });
    } catch (err) {
      logger.error(`Cron prefetch failure: ${err.message}`);
    }
  });

  // 2. Scheduled alert delivery: instant dispatch at minute 0
  const dispatchTask = cron.schedule('0 * * * *', async () => {
    try {
      await dispatchDueAlerts({
        db: typeof dbProvider === 'function' ? dbProvider() : dbProvider,
        client: apiClient,
        gemini: geminiClient,
        logger,
      });
    } catch (err) {
      logger.error(`Cron dispatch failure: ${err.message}`);
    }
  });

  // 3. Public trending radar pre-warm: 3 times daily, 15 min before 8 AM, 2 PM, 8 PM (7:45, 13:45, 19:45 IST)
  const trendingRadarTask = cron.schedule('45 7,13,19 * * *', async () => {
    try {
      await refreshTrendingRadar({
        client: apiClient,
        gemini: geminiClient,
        logger,
      });
    } catch (err) {
      logger.error(`Trending radar pre-warm failure: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // 4. Minute ticker: checks newly created topics that crossed the 10-minute threshold
  const initialTicker = cron.schedule('* * * * *', async () => {
    try {
      await processInitialTopicAlerts({
        db: typeof dbProvider === 'function' ? dbProvider() : dbProvider,
        client: apiClient,
        logger,
      });
    } catch (err) {
      logger.error(`Initial alert ticker failure: ${err.message}`);
    }
  });

  logger.info('Cron scheduler initialized (pre-fetch: 50 * * * *, dispatch: 0 * * * *, trending radar: 45 7,13,19 * * *, 10-min initial checks: * * * * *).');

  return {
    stop: () => {
      prefetchTask.stop();
      dispatchTask.stop();
      trendingRadarTask.stop();
      initialTicker.stop();
    },
  };
}
