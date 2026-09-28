/** Read-only collection evidence for local checks and GitHub Actions summaries. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { appendFile, writeFile } from 'node:fs/promises';

const db = new PrismaClient({ log: [] });

try {
  const topics = await db.topic.findMany({
    where: { userId: { not: null } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      _count: { select: { snapshots: true, diffs: true } },
      snapshots: { orderBy: { pulledAt: 'desc' }, take: 1, select: { pulledAt: true } },
      diffs: {
        orderBy: { detectedAt: 'desc' }, take: 1,
        select: { summary: true, sourceUrls: true, detectedAt: true, alerted: true },
      },
    },
  });
  const report = {
    checkedAt: new Date().toISOString(),
    topics: topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      snapshots: topic._count.snapshots,
      diffs: topic._count.diffs,
      latestPull: topic.snapshots[0]?.pulledAt ?? null,
      latestDiff: topic.diffs[0] ?? null,
    })),
  };
  const totalDiffs = report.topics.reduce((total, topic) => total + topic.diffs, 0);
  const historyReady = topics.length > 0 && report.topics.every((topic) => topic.snapshots >= 3) && totalDiffs >= 3;
  const cell = (value) => String(value ?? 'none').replace(/[|\r\n]/g, ' ');
  const markdown = [
    '## Pipeline collection evidence',
    '',
    `Checked: ${report.checkedAt}`,
    '',
    '| Topic | Snapshots | Diffs | Latest pull (UTC) |',
    '| --- | ---: | ---: | --- |',
    ...report.topics.map((topic) => `| ${cell(topic.name)} | ${topic.snapshots} | ${topic.diffs} | ${cell(topic.latestPull?.toISOString())} |`),
    '',
    `History target (3+ snapshots per topic, 3+ diffs overall): ${historyReady ? 'met' : 'pending'}.`,
    'Counts alone do not prove material changes; review the source links before the demo.',
    '',
  ].join('\n');
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (process.env.PIPELINE_REPORT_PATH) await writeFile(process.env.PIPELINE_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
} catch {
  console.error('Pipeline status failed: check database connectivity, migrations, and report output permissions.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
