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

The direct hostname resolved to IPv6 only. The GitHub `DATABASE_URL` secret was subsequently switched to the user-provided Session pooler, with SSL required and one Prisma connection. This resolved connectivity without schema changes or edits to the seed script, diff engine, alert service, or frontend.

## Successful live collection

- [First successful run](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36402371029): seeded/preserved the three initial topics and stored their first snapshots. All 23 tests passed in Actions. The run made six successful SerpApi requests using key index 1; key index 2 was configured but not needed.
- [Second successful run](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36402485421): stored a second snapshot per topic and exercised comparison with the real diff engine. The returned results were unchanged, so no Diff rows were inserted.
- [Third successful run](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36402582809): the database report at `2026-09-28T09:18:14.195Z` confirmed three snapshots for each of the three topics (nine total) and zero Diffs. The source results remained unchanged.
- A separate read-only database check confirmed the exact rawData keys, result fields, non-empty arrays, ten-item bounds, valid source URLs, trimmed text, and matching snapshot timestamps for all three topics.

| Topic | Search results in first snapshot | News results in first snapshot |
| --- | ---: | ---: |
| PM-KISAN Scheme Eligibility | 7 | 10 |
| SSC CGL 2026 Recruitment | 9 | 10 |
| UPSC CSE 2026 Notification | 9 | 10 |

These manual runs validate ingestion and unchanged-result handling. Closely spaced requests may reuse SerpApi's cache, so they do not establish that real-world information has changed. Alerts remain disabled on these three topics until the email integration is available.

## Still requires live evidence

- An actual run triggered by the six-hour schedule, not just manual dispatch.
- Three real, reviewed Diffs overall; the three-snapshots-per-Topic target is already met.
- Optional remaining SerpApi keys 3/4 from the team.
- SMTP secrets and the real `sendDiffAlert(topic, diff)` export from the alert-service owner, followed by a successful delivery test.

Use `npm run pipeline:status` or the Actions summary to check history counts. Read the latest summaries and source URLs in the downloaded JSON artifact for the demo. Never create synthetic database changes to reach the history target.
