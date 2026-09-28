# Demo runbook

The submission video should be under three minutes and show the real local app. Wait for at least three genuine, source-linked Diffs before recording; repeated pulls with unchanged data are not a substitute.

## Before recording

1. Check GitHub Actions for one successful **schedule** run and open its database-count summary.
2. Run `npm ci`, `npm run prisma:generate`, `npm test`, and `npm --workspace=frontend run build` on a clean checkout.
3. Set the local database connection in ignored `.env` files. Start `npm run backend` and `npm run frontend` in separate terminals.
4. Confirm the dashboard shows the live topics, latest pull times, and a timeline with at least three reviewed Diffs. Check that each Diff's citations open the claimed source.
5. Configure SMTP Secrets and an alert address on one topic, then verify a real update produces a delivered message and an `alerted` Diff. Do not use fabricated snapshot rows or manually change source content to force the demo.
6. Keep database passwords and API keys out of screen recordings, browser tabs, and terminal scrollback.

## Suggested video sequence (about 2½ minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:25 | Add a tracked topic in the local dashboard | “Notice Me watches slow-changing public information so users don’t need to remember to search again.” |
| 0:25–0:55 | Open an existing topic and its latest Search + News sources | “The collection job uses both SerpApi Search and Google News on a six-hour schedule.” |
| 0:55–1:35 | Open a real change card and its source URLs | “We compare each pull with the previous snapshot and show only detected changes in a dated timeline.” |
| 1:35–2:05 | GitHub Actions successful scheduled run and summary | “Collection runs even while the local frontend is closed. Each run stores evidence in Supabase.” |
| 2:05–2:30 | Show the delivered email and corresponding `alerted` change | “When a subscribed topic changes, the source-linked alert is emailed.” |

The [official rules](https://serpapi.github.io/serpapi-india-hackathon-2026/rules.html) list **October 10, 2026 at 23:59 IST** as the submission deadline; the original external planning PRD says October 5. Use the official date. Submit the public repository link, select **Knowledge & Public Interest**, answer the prior-project and AI-tool disclosure fields truthfully, and list all four team members with their own confirmed contact addresses. The form also asks how the lead learned about the event, the lead's mobile number, occupation, and years of experience. These submission-form actions require the team's details and authenticated account access.
