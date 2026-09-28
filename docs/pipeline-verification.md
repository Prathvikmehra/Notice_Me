# Pipeline verification — 2026-09-28

## Verified

- Clean `npm ci`, Prisma Client generation, and all 29 current tests pass locally and in GitHub Actions with Node 20. The first successful Actions run on the earlier commit passed its then-current 23 tests.
- Tests cover empty/invalid responses, quota rotation, key-safe logs, first snapshots, real diff-engine integration, rollback on comparison failure, failed alerts, non-zero CLI exits, and read-only history reporting.
- `.env` and `backend/.env` are ignored by Git.
- GitHub has `DATABASE_URL`, `SERPAPI_KEY_1`–`SERPAPI_KEY_5`, and all five SMTP secrets configured. Secret values are not included here.
- The six-hour schedule and manual dispatch are committed on `main`; concurrent collection runs are serialized.
- The workflow generates a database-count summary and JSON evidence artifact when the database is reachable.

## Local product verification

- Express API now implements topic creation/listing/deletion, the dated Diff timeline, latest-snapshot lookup, and alert email settings. Requests were exercised with an in-memory database; malformed input and missing topics returned the expected errors.
- The Nodemailer service was exercised with an in-memory transport. It formats a source-linked email, rejects missing settings or a refused recipient, and never marks a Diff alerted until its recipient is accepted. A later live Actions run also verified SMTP acceptance; the recipient reports that neither message reached inbox or spam, so delivery remains unresolved.
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

These early manual runs validate ingestion and unchanged-result handling. Closely spaced requests may reuse SerpApi's cache, so the source links and summaries still need human review before the demo.

## Current live evidence

- [Run 36441985047](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36441985047) passed on `main` with all 29 tests, frontend build, and collection for four tracked topics. Its artifact recorded six Diffs across the three original topics, two each, from live Search and News pulls. A fourth, newer topic had its first snapshot.
- [SMTP test run 36444223926](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36444223926) passed with a temporary recipient on one original topic. It retried that topic's two genuine pending Diffs, and the database confirmed both were marked `alerted=true` only after the SMTP server accepted them. The topic's previous disabled alert settings were restored after the test; the other topics' settings were untouched. The recipient later reported no message in inbox or spam; SMTP acceptance alone did not prove delivery.
- The second run's artifact recorded eight or nine snapshots and two Diffs for each original topic; the newly added fourth topic had two snapshots and no Diff. The history target for **every current topic** will be met after its next successful pull, provided the topic remains tracked. No fabricated snapshots or Diffs were written.

## Still requires live evidence

- An actual run triggered by the six-hour schedule, not just manual dispatch.
- Human review of the six live Diff summaries and source URLs for the demo; an artifact count alone does not prove a material change.
- The newly added topic's third snapshot, diagnosis and repair of the SMTP delivery problem, and the recorded demo/submission.

Use `npm run pipeline:status` or the Actions summary to check history counts. Read the latest summaries and source URLs in the downloaded JSON artifact for the demo. Never create synthetic database changes to reach the history target.
