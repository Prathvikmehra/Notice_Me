# Pipeline verification — 2026-09-28

## Verified

- Node 20: clean `npm ci`, Prisma Client generation, and all 23 tests pass.
- Tests cover empty/invalid responses, quota rotation, key-safe logs, first snapshots, real diff-engine integration, rollback on comparison failure, failed alerts, non-zero CLI exits, and read-only history reporting.
- `.env` and `backend/.env` are ignored by Git.
- GitHub has `DATABASE_URL`, `SERPAPI_KEY_1`, and `SERPAPI_KEY_2` configured. Secret values are not included here.
- The six-hour schedule and manual dispatch are committed on `main`; concurrent collection runs are serialized.
- The workflow generates a database-count summary and JSON evidence artifact when the database is reachable.

## First live attempt

[Actions run 36401836624](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36401836624) passed dependency installation, Prisma generation, and all tests. It failed during the seed script's first database read because the configured direct Supabase endpoint was unreachable. Collection did not start; this run did not consume SerpApi requests or create snapshots/diffs. The failure was visible as a red Actions run with a non-zero exit.

The direct hostname resolved to IPv6 only. Replace the workflow's `DATABASE_URL` with the project's exact Session pooler connection string from Supabase's Connect dialog, then repeat the manual run. No schema changes or edits to the seed script, diff engine, alert service, or frontend were made for this verification.

## Still requires live evidence

- Successful collection and valid Search + News snapshots in Supabase.
- An actual run triggered by the six-hour schedule, not just manual dispatch.
- At least three snapshots per tracked Topic and three real, reviewed Diffs overall.
- Optional remaining SerpApi keys 3/4 from the team.
- SMTP secrets and the real `sendDiffAlert(topic, diff)` export from the alert-service owner, followed by a successful delivery test.

Use `npm run pipeline:status` or the Actions summary to check history counts. Read the latest summaries and source URLs in the downloaded JSON artifact for the demo. Never create synthetic database changes to reach the history target.
