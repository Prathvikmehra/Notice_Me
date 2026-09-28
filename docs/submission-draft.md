# Notice Me — submission draft

Copy only verified facts into the [official submission dashboard](https://serpapi.github.io/serpapi-india-hackathon-2026/). The official deadline is **October 10, 2026 at 23:59 IST**. The original planning PRD has an earlier deadline.

**Project name:** Notice Me

**Track:** Knowledge & Public Interest

**Public repository:** https://github.com/Prathvikmehra/Notice_Me

**Description:** Notice Me watches public topics such as government schemes, exams, recruitment notices, and policy updates. People often miss a quiet deadline or eligibility change because they do not remember to search again. Users register a query once. A scheduled job collects live Google Search and Google News results, stores dated snapshots in PostgreSQL, and compares each pull with the previous one. The local dashboard shows a source-linked timeline of detected changes and can email subscribers when a new change appears.

**SerpApi usage:** The scheduled job calls SerpApi's Google Search engine for organic results and Google News engine (`engine=google_news`) for published articles. Both feeds are essential: without fresh results there is no snapshot, comparison, timeline, or alert. The collector trims each feed to ten linked results and rotates among configured SerpApi keys when quota is exhausted or the API returns 429. Snapshots and generated Diffs come from live API responses, not fabricated demo records.

**Why this is useful:** Students and citizens can monitor slow-changing official topics without manually repeating searches. Each change is dated and linked to its original source so users can verify it.

**New or existing project:** Planning PRD says this project started for the hackathon; verify this before choosing “No.” The official rules allow existing projects when properly disclosed.

**AI tools:** OpenAI Codex assisted with coding, tests, documentation, and QA in this workspace. Confirm which additional tools the team actually used before listing ChatGPT, Claude, Antigravity, or OpenCode and describe their contributions accurately.

**Demo video:** Pending a real, source-linked change and successful alert delivery. Record a local run under three minutes, publish an accessible video link, and verify it opens in a private window.

**Lead participant:** Confirm full name, email, mobile number, occupation, and years of professional experience with the person submitting. Do not put those details in this public repository.

**Additional team members:** Confirm the names and email addresses of all three teammates with them. Do not put those details in this public repository.

**Community source / how you learned about the event:** Ask the lead participant; this field is required by the official form.

**Rules and Terms:** The signed-in lead participant must read and accept them in the dashboard. A saved draft is not a submitted entry.
