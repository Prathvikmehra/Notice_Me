/** Scheduled ingestion entry point: node scripts/pull-and-diff.js */
import { pathToFileURL } from 'node:url';
import { createSerpApiClient } from './serpapi-client.js';
import { diff } from './diff-engine.js';
import * as alertService from '../backend/src/services/alertService.js';

export const FREQUENCIES = {
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '5d': 5 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function parseFrequencyToMs(freqStr) {
  if (!freqStr) return 24 * 60 * 60 * 1000;
  const str = String(freqStr).trim().toLowerCase();
  if (FREQUENCIES[str]) return FREQUENCIES[str];
  if (['daily', '1d'].includes(str)) return 24 * 60 * 60 * 1000;
  if (['weekly', '7d', '1w'].includes(str)) return 7 * 24 * 60 * 60 * 1000;
  if (['biweekly', 'bi-weekly', '14d', '2w'].includes(str)) return 14 * 24 * 60 * 60 * 1000;
  if (['monthly', '30d', '1m'].includes(str)) return 30 * 24 * 60 * 60 * 1000;
  const match = str.match(/^(\d+)\s*(h|hours?|d|days?|w|weeks?|m|months?)?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'd').charAt(0).toLowerCase();
    if (unit === 'h') return Math.max(1, val) * 60 * 60 * 1000;
    if (unit === 'd') return Math.max(1, val) * 24 * 60 * 60 * 1000;
    if (unit === 'w') return Math.max(1, val) * 7 * 24 * 60 * 60 * 1000;
    if (unit === 'm') return Math.max(1, val) * 30 * 24 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

function isAlertDue(topic) {
  if (!topic?.alertEmail) return false;
  if (topic.alertEnabled === false) return false;
  if (topic.lastAlertedAt && topic.alertFrequency) {
    const minInterval = parseFrequencyToMs(topic.alertFrequency);
    const elapsed = Date.now() - new Date(topic.lastAlertedAt).getTime();
    if (elapsed < minInterval) return false;
  }
  return true;
}

export async function runPipeline({ db, client, logger = console }) {
  // Legacy seed rows have no owner and are invisible to the authenticated app.
  const topics = await db.topic.findMany({ where: { userId: { not: null } }, orderBy: { id: 'asc' } });
  if (topics.some((topic) => topic.alertEmail && topic.alertEnabled !== false) && typeof alertService.sendDiffAlert !== 'function') {
    throw new Error('alertService.js must export sendDiffAlert(topic, diff) before processing topics with alertEmail.');
  }
  if (topics.some((topic) => topic.alertEmail && topic.alertEnabled !== false) && !alertService.isAlertConfigured?.()) {
    throw new Error('Email alerts are enabled but SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, or ALERT_FROM is missing.');
  }
  const from = process.env?.ALERT_FROM || '';
  const fromAddress = (from.match(/<([^<>]+)>/)?.[1] || from).trim().toLowerCase();
  if (topics.some((topic) => topic.alertEmail && topic.alertEnabled !== false) &&
      fromAddress.endsWith('@smtp-brevo.com')) {
    throw new Error('ALERT_FROM cannot be the Brevo SMTP login; configure a verified sender address.');
  }

  for (const topic of topics) {
    let stage = 'sending pending diff alerts';
    try {
      if (isAlertDue(topic)) {
        const pending = await db.diff.findMany({
          where: { topicId: topic.id, alerted: false },
          orderBy: { detectedAt: 'asc' },
        });
        for (const change of pending) {
          const sent = await alertService.sendDiffAlert(topic, change);
          if (sent === false) throw new Error('Alert service reported delivery failure.');
          await db.diff.update({ where: { id: change.id }, data: { alerted: true } });
        }
      }
      stage = 'pulling Search and News';
      const rawData = await client.pullSnapshot(topic.query);
      if (!rawData?.search?.length || !rawData?.news?.length) {
        throw new Error('Refusing an empty or partial snapshot.');
      }
      stage = 'saving the snapshot and computing its diff';
      const change = await db.$transaction(async (tx) => {
        // Read before inserting so the new row can never be its own baseline.
        const previous = await tx.snapshot.findFirst({
          where: { topicId: topic.id },
          orderBy: [{ pulledAt: 'desc' }, { id: 'desc' }],
        });
        const current = await tx.snapshot.create({
          data: { topicId: topic.id, rawData, pulledAt: new Date(rawData.pulledAt) },
        });

        // Prune snapshots beyond retention limit
        const retentionLimit = Number(process?.env?.SNAPSHOT_RETENTION_LIMIT || 20);
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
            // Retention pruning error is non-critical
          }
        }

        if (!previous) return null;
        const result = await diff(previous, current);
        if (result === null) return null;
        if (!result || typeof result.summary !== 'string' || !result.summary.trim() ||
            !Array.isArray(result.sourceUrls) || result.sourceUrls.length === 0 ||
            result.sourceUrls.some((url) => typeof url !== 'string' || !url.trim())) {
          throw new Error('Diff engine returned an invalid result.');
        }
        return tx.diff.create({
          data: { topicId: topic.id, summary: result.summary, sourceUrls: result.sourceUrls, alerted: false },
        });
      }, { isolationLevel: 'Serializable' });

      if (change && isAlertDue(topic)) {
        stage = 'sending the diff alert';
        // Integration contract: sendDiffAlert(topic, diff) rejects on delivery failure.
        const sent = await alertService.sendDiffAlert(topic, change);
        if (sent === false) throw new Error('Alert service reported delivery failure.');
        stage = 'marking the diff alerted';
        await db.diff.update({ where: { id: change.id }, data: { alerted: true } });
        if (typeof db.topic?.update === 'function') {
          await db.topic.update({ where: { id: topic.id }, data: { lastAlertedAt: new Date() } });
        }
      }
      logger.info(`Topic ${topic.id}: snapshot saved${change ? ', diff created' : ', no diff'}.`);
    } catch (error) {
      if (stage === 'pulling Search and News') throw error;
      throw new Error(`Topic ${topic.id}: failed while ${stage}; pipeline stopped.`);
    }
  }
  logger.info(`Pipeline completed: ${topics.length} topic(s).`);
}

export async function main() {
  // Load the repository-root .env for local execution; Actions supplies environment secrets.
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: new URL('../.env', import.meta.url) });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const client = createSerpApiClient();
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    await runPipeline({ db, client });
  } finally {
    console.info(`SerpApi usage this run (not billed quota): ${JSON.stringify(client.getUsage())}`);
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    let message = error instanceof Error ? error.message : 'Unknown pipeline error.';
    for (const name of ['DATABASE_URL', 'SERPAPI_KEY_1', 'SERPAPI_KEY_2', 'SERPAPI_KEY_3', 'SERPAPI_KEY_4', 'SERPAPI_KEY_5', 'SMTP_PASS']) {
      const secret = process.env[name];
      if (secret) {
        message = message.replaceAll(secret, '[REDACTED]').replaceAll(encodeURIComponent(secret), '[REDACTED]');
      }
    }
    console.error(`Pipeline failed: ${message}`);
    process.exitCode = 1;
  });
}
