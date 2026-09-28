# Pipeline verification — 2026-09-28

## Verified

- Node 20: clean `npm ci`, Prisma Client generation, and all 26 tests pass locally. The first successful Actions run on the earlier commit passed its then-current 23 tests.
- Tests cover empty/invalid responses, quota rotation, key-safe logs, first snapshots, real diff-engine integration, rollback on comparison failure, failed alerts, non-zero CLI exits, and read-only history reporting.
- `.env` and `backend/.env` are ignored by Git.
- GitHub has `DATABASE_URL`, `SERPAPI_KEY_1`, and `SERPAPI_KEY_2` configured. Secret values are not included here.
- The six-hour schedule and manual dispatch are committed on `main`; concurrent collection runs are serialized.
- The workflow generates a database-count summary and JSON evidence artifact when the database is reachable.

## Local product verification

- Express API now implements topic creation/listing/deletion, the dated Diff timeline, latest-snapshot lookup, and alert email settings. Requests were exercised with an in-memory database; malformed input and missing topics returned the expected errors.
- The Nodemailer service was exercised with an in-memory transport. It formats a source-linked email, rejects missing settings or a refused recipient, and never marks a Diff alerted until its recipient is accepted. Real SMTP delivery awaits the team credentials.
- The React dashboard was opened against the live read-only API. All three real topics and their latest source counts appeared. Browser checks found no console errors, failed network requests, or horizontal overflow at 1440, 768, and 375 pixels.
- A separate browser run used intercepted in-memory API responses to exercise add topic, display a Diff and citation, save an alert email, and delete a topic. It did not mutate Supabase.
- The automated axe-core WCAG 2.2 AA scan found no violations on the inspected detail view. This does not replace a manual screen-reader pass. No committed screenshot baseline exists, so visual regression comparison is inconclusive; desktop and mobile screenshots were inspected manually.

## First live attempt

[Actions run 36401836624](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36401836624) passed dependency installation, Prisma generation, and all tests. It failed during the seed script's first database read because the configured direct Supabase endpoint was unreachable. Collection did not start; this run did not consume SerpApi requests or create snapshots/diffs. The failure was visible as a red Actions run with a non-zero exit.

The direct hostname resolved to IPv6 only. The GitHub `DATABASE_URL` secret was subsequently switched to the user-provided Session pooler, with SSL required and one Prisma connection. This resolved connectivity without schema changes or edits to the seed script, diff engine, alert service, or frontend.

## Successful live collection

- [First successful run](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36402371029): seeded/preserved the three initial topics and stored their first snapshots. All 23 tests passed in Actions. The run made six successful SerpApi requests using key index 1; key index 2 was configured but not needed.
- [Second successful run](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36402485421): stored a second snapshot per topic and exercised comparison with the real diff engine. The returned results were unchanged, so no Diff rows were inserted.
- [Third successful run](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36402582809): the database report at `2026-09-28T09:18:14.195Z` confirmed three snapshots for each of the three topics (nine total) and zero Diffs. The source results remained unchanged.
- [Full product workflow run](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36404415086): install, Prisma generation, 26 tests, frontend build, collection, and reporting all passed. Its report at `2026-09-28T09:35:20.472Z` showed four snapshots per topic and zero Diffs.
- A separate read-only database check confirmed the exact rawData keys, result fields, non-empty arrays, ten-item bounds, valid source URLs, trimmed text, and matching snapshot timestamps for all three topics.

| Topic | Search results in first snapshot | News results in first snapshot |
| --- | ---: | ---: |
| PM-KISAN Scheme Eligibility | 7 | 10 |
| SSC CGL 2026 Recruitment | 9 | 10 |
| UPSC CSE 2026 Notification | 9 | 10 |

These manual runs validate ingestion and unchanged-result handling. Closely spaced requests may reuse SerpApi's cache, so they do not establish that real-world information has changed. Alerts remain disabled on these three topics until SMTP credentials are available.

## Still requires live evidence

- An actual run triggered by the six-hour schedule, not just manual dispatch.
- Three real, reviewed Diffs overall; the three-snapshots-per-Topic target is already met. Four genuine snapshots per Topic are stored as of the full product run.
- Optional remaining SerpApi keys 3/4 from the team.
- SMTP secrets and a real delivery test. `sendDiffAlert(topic, diff)` is implemented and covered by mock transport tests.

Use `npm run pipeline:status` or the Actions summary to check history counts. Read the latest summaries and source URLs in the downloaded JSON artifact for the demo. Never create synthetic database changes to reach the history target.
