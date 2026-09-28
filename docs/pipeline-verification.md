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
- Before authentication was added, the React dashboard was opened against the live read-only API. The three then-visible seed topics and their latest source counts appeared. Browser checks found no console errors, failed network requests, or horizontal overflow at 1440, 768, and 375 pixels. This browser pass does not verify the later authenticated experience.
- A separate browser run used intercepted in-memory API responses to exercise add topic, display a Diff and citation, save an alert email, and delete a topic. It did not mutate Supabase.
- The automated axe-core WCAG 2.2 AA scan found no violations on the inspected detail view. This does not replace a manual screen-reader pass. No committed screenshot baseline exists, so visual regression comparison is inconclusive; desktop and mobile screenshots were inspected manually.

## First live attempt

[Actions run 36401836624](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36401836624) passed dependency installation, Prisma generation, and all tests. It failed during the seed script's first database read because the configured direct Supabase endpoint was unreachable. Collection did not start; this run did not consume SerpApi requests or create snapshots/diffs. The failure was visible as a red Actions run with a non-zero exit.

The direct hostname resolved to IPv6 only. The GitHub `DATABASE_URL` secret was subsequently switched to the user-provided Session pooler, with SSL required and one Prisma connection. This resolved connectivity without schema changes or edits to the seed script, diff engine, alert service, or frontend.

## Legacy pre-auth live collection

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

## Legacy collection evidence and current app status

- [Run 36441985047](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36441985047) passed on `main` with all 29 tests, frontend build, and collection for four database rows. Its six Diffs belonged to the three old seed topics, which have no `userId`. Rishab's authenticated dashboard does not show them, so they do **not** establish the current app's three-Diff goal.
- [SMTP test run 36444223926](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36444223926) used one of those legacy topics. Brevo accepted two pending Diff emails and the database marked them `alerted=true`, but the recipient reported no message in inbox or spam. The topic's prior disabled settings were restored. This test does not demonstrate delivery for a user-owned topic.
- [Direct SMTP diagnostic](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36445263780) confirmed Brevo accepted another message with `250 queued` and message ID `<59e7230c-d1cd-d415-5e7a-73e504342c3d@smtp-brevo.com>`. [Sender configuration check](https://github.com/Prathvikmehra/Notice_Me/actions/runs/36445498699) showed `ALERT_FROM` was set to the Brevo technical SMTP login. [Brevo says this login cannot be a From address](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP); use a verified sender instead. The pipeline and diagnostic now reject that known-bad configuration before another alert is marked sent. Check Brevo's transactional event for the queued message to establish the actual delivery outcome.
- A read-only check on 2026-09-28 at 15:50 UTC found three unowned legacy topics and one owner-linked topic. The owner-linked topic had **two snapshots and zero Diffs**. The collector and status report now select only owner-linked topics; the old rows remain in the database but no longer consume scheduled SerpApi requests or inflate current-app evidence. No fabricated snapshots or Diffs were written.

## Still requires live evidence

- An actual run triggered by the six-hour schedule, not just manual dispatch.
- At least three snapshots per current user-owned topic and three genuine Diffs visible in the authenticated app; the legacy six Diffs do not count. Review their source URLs before the demo.
- Replacement of `ALERT_FROM` with a verified sender, Brevo delivery-log confirmation and an inbox-verified alert from a user-owned topic, and the recorded demo/submission.

Use `npm run pipeline:status` or the Actions summary to check history counts. Read the latest summaries and source URLs in the downloaded JSON artifact for the demo. Never create synthetic database changes to reach the history target.
