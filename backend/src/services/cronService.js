import cron from 'node-cron';
import { getDb } from './db.js';
import { createSerpApiClient } from '../../../scripts/serpapi-client.js';
import { diff } from '../../../scripts/diff-engine.js';
import { syncTopic } from './topicSyncService.js';
import { getGeminiClient } from './geminiService.js';
import { refreshTrendingRadar } from './trendingService.js';
import * as alertService from './alertService.js';

export function getLocalTimeDetails(timeZone = 'Asia/Kolkata', now = new Date()) {
  const safeTz = timeZone || 'Asia/Kolkata';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
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
  const safeTz = timeZone || 'Asia/Kolkata';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: safeTz, year: 'numeric', month: '2-digit', day: '2-digit' });
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
  const safeTz = timeZone || 'Asia/Kolkata';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: safeTz, year: 'numeric', month: '2-digit', day: '2-digit' });
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

export function parseFrequencyToHours(freqStr) {
  if (!freqStr) return 24;
  const str = String(freqStr).trim().toLowerCase();
  if (str === '1h') return 1;
  if (str === '3h') return 3;
  if (['daily', '1d'].includes(str)) return 24;
  if (['weekly', '7d', '1w'].includes(str)) return 168;
  if (['biweekly', 'bi-weekly', '14d', '2w'].includes(str)) return 336;
  if (['monthly', '30d', '1m'].includes(str)) return 720;
  const match = str.match(/^(\d+)\s*(h|hours?|d|days?|w|weeks?|m|months?)?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'd').charAt(0).toLowerCase();
    if (unit === 'h') return Math.max(1, val);
    if (unit === 'd') return Math.max(1, val * 24);
    if (unit === 'w') return Math.max(1, val * 7 * 24);
    if (unit === 'm') return Math.max(1, val * 30 * 24);
  }
  return null;
}

export function parseFrequencyToMs(freqStr) {
  const hours = parseFrequencyToHours(freqStr);
  return hours !== null ? hours * 60 * 60 * 1000 : null;
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

export function filterEligibleTopics(candidates = [], now = new Date(), options = null) {
  // Support numeric targetHour as 3rd param or options object
  const overrideHour = typeof options === 'number' ? options : options?.targetHour;
  const checkTime = options?.checkTime instanceof Date ? options.checkTime : now;

  return candidates.filter((t) => {
    // 1. Guard against disabled alerts or explicitly null email
    if (t.alertEnabled === false || t.alertEmail === null) return false;

    const tz = t.timezone || 'Asia/Kolkata';
    const { hour: topicHour, weekday, month, dayOfMonth, isWeekend } = getLocalTimeDetails(tz, checkTime);
    const hourToCheck = overrideHour !== undefined && overrideHour !== null ? overrideHour : topicHour;
    const currentWeekday = weekday.toLowerCase();

    const freq = String(t.alertFrequency || '1d').toLowerCase().trim();
    const freqHours = parseFrequencyToHours(freq) || 24;
    const isSubDaily = freqHours < 24;
    const isMonthly = ['monthly', '30d', '1m'].includes(freq);

    // 2. Hour check:
    // Sub-daily frequencies run during any hour provided interval has elapsed.
    // Daily+ frequencies run only at their scheduled alertHour.
    if (!isSubDaily) {
      if (t.alertHour !== undefined && t.alertHour !== null && t.alertHour !== hourToCheck) {
        return false;
      }
    }

    // 3. Day / Date check:
    const daySetting = String(t.alertDays || 'weekdays').toLowerCase().trim();
    if (isMonthly) {
      // Monthly topics require a valid day-of-month (1-30). Default to 1st if invalid.
      const targetDay = /^(?:[1-9]|[12][0-9]|30)$/.test(daySetting) ? Number(daySetting) : 1;
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
    } else if (/^(?:[1-9]|[12][0-9]|30)$/.test(daySetting)) {
      const targetDay = Number(daySetting);
      if (month === 2) {
        if (targetDay >= 28) {
          if (dayOfMonth !== 28) return false;
        } else {
          if (targetDay !== dayOfMonth) return false;
        }
      } else {
        if (targetDay !== dayOfMonth) return false;
      }
    } else {
      if (daySetting === 'weekdays' && isWeekend) return false;
      if (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(daySetting)) {
        if (daySetting !== currentWeekday) return false;
      }
    }

    // 4. Interval & frequency check:
    if (t.lastAlertedAt) {
      if (isSubDaily) {
        const elapsedMs = now.getTime() - new Date(t.lastAlertedAt).getTime();
        const requiredMs = freqHours * 60 * 60 * 1000;
        // 5 minute tolerance for cron tick alignment
        if (elapsedMs < (requiredMs - 5 * 60 * 1000)) return false;
      } else {
        const daysDiff = getCalendarDaysDiff(t.lastAlertedAt, now, tz);
        // Already alerted today in this topic's timezone: skip until at least tomorrow
        if (daysDiff < 1) return false;

        if (isMonthly) {
          if (daysDiff < 20) return false;
        } else {
          const requiredDays = parseFrequencyToDays(freq) || 1;
          if (daysDiff < requiredDays) return false;
        }
      }
    }
    return true;
  });
}

export async function runWithConcurrency(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Pre-fetch phase (T - 10 minutes, runs at minute 50: `50 * * * *`):
 * Looks ahead 10 minutes to the upcoming hour in each topic's local timezone.
 * Pulls SerpApi snapshots and generates Gemini summaries ahead of time,
 * saving them with `alerted: false` so that the on-the-hour dispatch is instantaneous.
 */
export async function prefetchUpcomingTopics({ db, client, gemini, logger = console, now = new Date() } = {}) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) {
    throw new Error('Database client with topic model is required');
  }

  // Look ahead 10 minutes for pre-fetch
  const targetTime = new Date(now.getTime() + 10 * 60 * 1000);
  const candidates = await activeDb.topic.findMany({
    where: {
      alertEnabled: true,
      alertEmail: { not: null },
    },
  });

  const topics = filterEligibleTopics(candidates, now, { checkTime: targetTime });
  if (topics.length === 0) return { prefetched: 0, targetTime, total: 0 };

  logger.info(`Cron [Pre-fetch]: Running T-10m data & AI fetch for ${topics.length} topic(s).`);
  const apiClient = client || createSerpApiClient();
  let prefetchedCount = 0;

  const CONCURRENCY = Number(process.env.CRON_INGESTION_CONCURRENCY || 3);
  await runWithConcurrency(topics, CONCURRENCY, async (topic) => {
    try {
      await syncTopic(topic.id, activeDb, apiClient, gemini, { skipAlert: true });
      prefetchedCount++;
    } catch (err) {
      logger.warn(`Cron [Pre-fetch]: error pre-fetching topic ${topic.id}: ${err.message}`);
    }
  });

  const { hour: targetHour } = getLocalTimeDetails('Asia/Kolkata', targetTime);
  logger.info(`Cron [Pre-fetch]: Completed pre-fetch for ${prefetchedCount}/${topics.length} topic(s).`);
  return { prefetched: prefetchedCount, targetHour, targetTime, total: topics.length };
}

/**
 * Dispatch phase (Runs at minute 0: `0 * * * *`):
 * Dispatches alerts for topics scheduled for the current hour in their timezone.
 * Sends pre-warmed alerts immediately. If pre-fetch didn't run, executes fallback on-demand.
 */
export async function dispatchDueAlerts({ db, client, gemini, logger = console, now = new Date() } = {}) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) {
    throw new Error('Database client with topic model is required');
  }

  const candidates = await activeDb.topic.findMany({
    where: {
      alertEnabled: true,
      alertEmail: { not: null },
    },
  });

  const topics = filterEligibleTopics(candidates, now);
  if (topics.length === 0) return { checked: 0, alerted: 0 };

  logger.info(`Cron [Dispatch]: Delivering scheduled alerts for ${topics.length} topic(s).`);
  const apiClient = client || createSerpApiClient();
  let alertedCount = 0;

  const CONCURRENCY = Number(process.env.CRON_INGESTION_CONCURRENCY || 3);
  await runWithConcurrency(topics, CONCURRENCY, async (topic) => {
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
        return;
      }

      // 2. Check if a snapshot was already pulled within the last 20 minutes (pre-fetch ran, no changes found)
      const latestSnapshot = await activeDb.snapshot.findFirst({
        where: { topicId: topic.id },
        orderBy: [{ pulledAt: 'desc' }, { id: 'desc' }],
      });

      const snapshotAgeMs = latestSnapshot?.pulledAt ? (now.getTime() - new Date(latestSnapshot.pulledAt).getTime()) : Infinity;
      if (snapshotAgeMs < 20 * 60 * 1000) {
        await activeDb.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: now } });
        return;
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
  });

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
 * Strictly verifies alertEnabled: true before syncing or emailing.
 */
export async function processInitialTopicAlerts({ db, client, logger = console, minAgeMs = Number(process.env.INITIAL_ALERT_DELAY_MS || 10 * 60 * 1000) } = {}) {
  const activeDb = typeof db === 'function' ? db() : (db || getDb());
  if (!activeDb?.topic) return { checked: 0, alerted: 0 };

  let pending = [];
  try {
    pending = await activeDb.topic.findMany({
      where: {
        alertEnabled: true,
        alertEmail: { not: null },
        lastAlertedAt: null,
      },
    });
  } catch {
    return { checked: 0, alerted: 0 };
  }

  const eligible = pending.filter((t) => {
    if (!t.alertEmail || !t.alertEnabled || t.lastAlertedAt) return false;
    const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    return Date.now() - created >= minAgeMs;
  });

  if (eligible.length === 0) return { checked: 0, alerted: 0 };

  const apiClient = client || createSerpApiClient();
  logger.info(`Cron: running 10-minute initial alert check for ${eligible.length} new topic(s).`);
  let alertedCount = 0;

  for (const topic of eligible) {
    try {
      const freshTopic = await activeDb.topic.findUnique({ where: { id: topic.id } });
      if (!freshTopic || !freshTopic.alertEnabled || !freshTopic.alertEmail || freshTopic.lastAlertedAt) {
        continue;
      }
      const syncResult = await syncTopic(freshTopic.id, activeDb, apiClient);
      if (!syncResult.diff && alertService.isAlertConfigured()) {
        await alertService.sendInitialAlert(freshTopic, syncResult.snapshot);
      }
      await activeDb.topic.update({
        where: { id: freshTopic.id },
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
