# Notice Me — Diff Engine Rules

## Overview

Notice Me is a stateful change-monitoring agent. Unlike search engines and chatbots that retrieve data once and immediately forget, Notice Me tracks changes over time by comparing periodic search and news snapshots against their last known state.

The Diff Engine (`scripts/diff-engine.js`) evaluates two snapshots—`previous` and `current`—and extracts only **material, actionable updates** while discarding search noise.

---

## Identity Model

- **Canonical Identifier:** Each search or news result is uniquely identified by its destination URL (`link`).
- The diff engine builds a lookup index of all items by trimmed link URL.
- Items appearing across both `search` and `news` collections within a snapshot are evaluated against prior entries having the same URL.

---

## What Counts as a Meaningful Change

A diff is recorded (`{ summary, sourceUrls }`) when any of the following occur:

### 1. New Result Discovered
- **Condition:** A URL exists in the current snapshot that did not exist in the previous snapshot.
- **Plain Language Summary:** `New result: <title>`
- **Citation:** The new URL is appended to `sourceUrls`.

### 2. Removed Result
- **Condition:** A URL that was present in the previous snapshot no longer appears in the top results of the current snapshot.
- **Plain Language Summary:** `Removed result: <title>`
- **Citation:** The removed URL is appended to `sourceUrls`.

### 3. Changed Content on an Existing Link
When a URL persists between snapshots, the engine compares its textual content and metadata:

- **Changed Snippet:**
  - **Condition:** The snippet text returned by SerpApi changes (e.g., revised eligibility limits, fee updates, application instructions).
  - **Plain Language Summary:** `Changed on <site>: <old_snippet> → <new_snippet>`
- **Changed Title:**
  - **Condition:** The page headline or notice title is revised (e.g., draft notice updated to official release).
  - **Plain Language Summary:** `Changed title on <site>: "<old_title>" → "<new_title>"`
- **Changed Date:**
  - **Condition:** The publication or indexing date string changes.
  - **Plain Language Summary:** `Changed date on <site>: <old_date> → <new_date>`
- **Citation:** The modified link URL is appended to `sourceUrls`.

Where `<site>` is extracted from the publisher source name if available (e.g., "The Hindu"), or the clean domain hostname (e.g., "pmkisan.gov.in").

---

## What is Ignored (Noise Filtering)

The diff engine deliberately filters out transient noise that does not represent real-world bureaucratic or factual changes:

1. **Rank Position Reordering:**
   - Web search rankings constantly fluctuate by a position or two due to search engine algorithmic adjustments.
   - If position 1 and position 2 swap ranks but their URLs, titles, snippets, and dates remain identical, the diff engine treats this as **no change** and returns `null`.

2. **First Snapshot Baseline:**
   - When a topic is first tracked, `previous` is `null`.
   - The diff engine returns `null` because there is no prior state to compare against; this first pull serves as the initial baseline.

3. **Pull Timestamps and Query Metadata:**
   - Ingestion timestamps (`pulledAt`) and query strings (`query`) belong to the scraper run, not the underlying content. They are excluded from content diffing.

4. **Whitespace Variations:**
   - Leading and trailing whitespace in titles, snippets, and URLs are trimmed before comparison to prevent false positives from formatting quirks.

5. **No Detected Changes:**
   - If none of the above conditions produce a material change, `diff(previous, current)` returns `null`.

---

## Output Contract

```typescript
type DiffResult = {
  summary: string;       // Human-readable change log separated by newlines
  sourceUrls: string[];  // Deduplicated list of source links backing each change
} | null;
```
