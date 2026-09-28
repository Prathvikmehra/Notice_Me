/** Scheduled ingestion entry point: node scripts/pull-and-diff.js */
import { pathToFileURL } from 'node:url';
import { createSerpApiClient } from './serpapi-client.js';
import { diff } from './diff-engine.js';
import * as alertService from '../backend/src/services/alertService.js';

export async function runPipeline({ db, client, logger = console }) {
  const topics = await db.topic.findMany({ orderBy: { id: 'asc' } });
  if (topics.some((topic) => topic.alertEmail) && typeof alertService.sendDiffAlert !== 'function') {
    throw new Error('alertService.js must export sendDiffAlert(topic, diff) before processing topics with alertEmail.');
  }

  for (const topic of topics) {
    let stage = 'pulling Search and News';
    try {
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

      if (change && topic.alertEmail) {
        stage = 'sending the diff alert';
        // Integration contract: sendDiffAlert(topic, diff) rejects on delivery failure.
        const sent = await alertService.sendDiffAlert(topic, change);
        if (sent === false) throw new Error('Alert service reported delivery failure.');
        stage = 'marking the diff alerted';
        await db.diff.update({ where: { id: change.id }, data: { alerted: true } });
      }
      logger.info(`Topic ${topic.id}: snapshot saved${change ? ', diff created' : ', no diff'}.`);
    } catch (error) {
      // Preserve safe client diagnostics; do not log database/SMTP errors containing credentials.
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
    for (const name of ['DATABASE_URL', 'SERPAPI_KEY_1', 'SERPAPI_KEY_2', 'SERPAPI_KEY_3', 'SERPAPI_KEY_4', 'SMTP_PASS']) {
      const secret = process.env[name];
      if (secret) {
        message = message.replaceAll(secret, '[REDACTED]').replaceAll(encodeURIComponent(secret), '[REDACTED]');
      }
    }
    console.error(`Pipeline failed: ${message}`);
    process.exitCode = 1;
  });
}
