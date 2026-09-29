/**
 * Gemini Client with multi-key pool rotation.
 * Synthesizes SerpApi Google Search & News data into executive intelligence briefings
 * and human-grade diff explanations.
 */

const QUOTA_ERROR = /quota|rate.?limit|resource_exhausted|too many requests|429/i;

export function parseGeminiKeys(env = process.env) {
  const keys = [];
  if (env.GEMINI_API_KEYS) {
    const split = env.GEMINI_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
    keys.push(...split);
  }
  for (let i = 1; i <= 10; i++) {
    const k = env[`GEMINI_API_KEY_${i}`];
    if (k && typeof k === 'string' && k.trim() && !keys.includes(k.trim())) {
      keys.push(k.trim());
    }
  }
  if (env.GEMINI_API_KEY && !keys.includes(env.GEMINI_API_KEY.trim())) {
    keys.push(env.GEMINI_API_KEY.trim());
  }
  return keys;
}

export function createGeminiClient({
  keys = null,
  env = process.env,
  fetchImpl = fetch,
  logger = console,
  model = 'gemini-2.5-flash',
} = {}) {
  const keyPool = (keys || parseGeminiKeys(env)).map((key, index) => ({ key, index: index + 1 }));
  let keyOffset = 0;

  async function callGemini(payload) {
    if (keyPool.length === 0) return null;

    while (keyOffset < keyPool.length) {
      const { key, index } = keyPool[keyOffset];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        logger.warn(`Gemini key index ${index} request failed or timed out: ${err.message}`);
        keyOffset++;
        continue;
      }

      if (response.status === 429 || response.status === 503) {
        logger.warn(`Gemini key index ${index} rate limited (HTTP ${response.status}); rotating to next key.`);
        keyOffset++;
        continue;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        logger.warn(`Gemini key index ${index} returned non-JSON response.`);
        keyOffset++;
        continue;
      }

      if (data?.error) {
        const errMsg = String(data.error.message || '');
        if (QUOTA_ERROR.test(errMsg) || data.error.code === 429) {
          logger.warn(`Gemini key index ${index} quota exceeded: ${errMsg}; rotating.`);
          keyOffset++;
          continue;
        }
        logger.warn(`Gemini API error on key index ${index}: ${errMsg}`);
        return null;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? text.trim() : null;
    }

    logger.warn('All configured Gemini API keys are rate limited or exhausted.');
    return null;
  }

  /**
   * Generates an executive intelligence briefing from SerpApi search & news records.
   */
  async function generateBriefing(topic, rawData) {
    if (!rawData || keyPool.length === 0) return null;

    const searchItems = (rawData.search || []).slice(0, 6).map((s) => ({
      title: s.title,
      link: s.link,
      snippet: s.snippet,
      date: s.date,
    }));

    const newsItems = (rawData.news || []).slice(0, 6).map((n) => ({
      title: n.title,
      source: n.source,
      date: n.date,
      link: n.link,
    }));

    const prompt = `You are a real-time intelligence analyst monitoring official notifications, exams, recruitment, court cases, and government schemes in India.
Analyze the following Google Search and Google News records for the topic "${topic.name}" (Category: "${topic.category || 'General'}", Query: "${topic.query}").

Search Records:
${JSON.stringify(searchItems, null, 2)}

News Bulletins:
${JSON.stringify(newsItems, null, 2)}

Synthesize this data into a JSON object with this exact structure:
{
  "coreStatus": "Clear, objective 2-sentence executive summary of the current verified situation.",
  "keyPoints": [
    { "badge": "SHORT_BADGE", "text": "High-impact takeaway or finding" }
  ],
  "deadlines": [
    { "title": "Milestone name", "date": "Date string or deadline", "urgency": "HIGH" | "MEDIUM" | "LOW" }
  ],
  "actionRequired": "Concrete next step for a candidate/beneficiary/citizen, or null if no action needed."
}

Rules:
- If a deadline or date is explicitly mentioned in search/news, extract it into the deadlines array.
- Badges should be short (1-2 words), e.g., "ADMIT CARD", "ELIGIBILITY", "DEADLINE", "VERIFIED", "RELEASED".
- Do not make up facts not present in the sources.
- Return ONLY the JSON object.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const rawJson = await callGemini(payload);
    if (!rawJson) return null;

    try {
      const parsed = JSON.parse(rawJson);
      if (typeof parsed?.coreStatus === 'string') {
        return {
          coreStatus: parsed.coreStatus.trim(),
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 4) : [],
          deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines.slice(0, 3) : [],
          actionRequired: parsed.actionRequired ? String(parsed.actionRequired).trim() : null,
          tag: 'AI VERIFIED INTELLIGENCE BRIEFING',
        };
      }
    } catch (err) {
      logger.warn(`Failed to parse Gemini briefing JSON: ${err.message}`);
    }
    return null;
  }

  /**
   * Explains what changed between two snapshots in clean, human-readable English for alerts and timelines.
   */
  async function generateDiffSummary(topic, { previous, current, rawSummary } = {}) {
    if (keyPool.length === 0) return rawSummary;

    const prevSearch = (previous?.search || []).slice(0, 4).map((s) => s.title);
    const currSearch = (current?.search || []).slice(0, 4).map((s) => s.title);
    const currNews = (current?.news || []).slice(0, 4).map((n) => n.title);

    const prompt = `You are an intelligence diff analyst.
Topic: "${topic.name}"
Query: "${topic.query}"
Raw Engine Diff: "${rawSummary || 'New records detected'}"

Previous Snapshot Headlines:
${JSON.stringify(prevSearch, null, 2)}

Current Snapshot Headlines & News:
Search: ${JSON.stringify(currSearch, null, 2)}
News: ${JSON.stringify(currNews, null, 2)}

In 1-2 crisp, professional sentences, summarize what actually changed or what new development occurred.
Focus on dates, decisions, releases, postponements, or policy changes.
Avoid saying "the snippet changed from A to B". Write directly like a news intelligence alert.
Output ONLY the 1-2 sentence explanation.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 250,
      },
    };

    const explanation = await callGemini(payload);
    return explanation || rawSummary;
  }

  return {
    generateBriefing,
    generateDiffSummary,
    getKeyCount: () => keyPool.length,
    getActiveKeyIndex: () => (keyPool[keyOffset] ? keyPool[keyOffset].index : null),
  };
}
