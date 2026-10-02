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
  model = env.GEMINI_MODEL || 'gemini-3.5-flash',
} = {}) {
  const keyPool = (keys || parseGeminiKeys(env)).map((key, index) => ({ key, index: index + 1, cooldownUntil: 0 }));
  let keyOffset = 0;

  async function callGemini(payload) {
    if (keyPool.length === 0) return null;

    const totalKeys = keyPool.length;
    let attempts = 0;
    const now = Date.now();

    while (attempts < totalKeys) {
      const current = keyPool[keyOffset % totalKeys];
      const { key, index } = current;

      // Skip keys still in cooldown unless we have tried all others
      if (current.cooldownUntil && current.cooldownUntil > now && attempts < totalKeys - 1) {
        keyOffset = (keyOffset + 1) % totalKeys;
        attempts++;
        continue;
      }

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
        keyOffset = (keyOffset + 1) % totalKeys;
        attempts++;
        continue;
      }

      if (response.status === 429 || response.status === 503) {
        logger.warn(`Gemini key index ${index} rate limited (HTTP ${response.status}); rotating to next key.`);
        current.cooldownUntil = Date.now() + 60_000;
        keyOffset = (keyOffset + 1) % totalKeys;
        attempts++;
        continue;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        logger.warn(`Gemini key index ${index} returned non-JSON response.`);
        keyOffset = (keyOffset + 1) % totalKeys;
        attempts++;
        continue;
      }

      if (data?.error) {
        const errMsg = String(data.error.message || '');
        if (QUOTA_ERROR.test(errMsg) || data.error.code === 429) {
          logger.warn(`Gemini key index ${index} quota exceeded: ${errMsg}; rotating.`);
          current.cooldownUntil = Date.now() + 60_000;
          keyOffset = (keyOffset + 1) % totalKeys;
          attempts++;
          continue;
        }
        logger.warn(`Gemini API error on key index ${index}: ${errMsg}`);
        return null;
      }

      current.cooldownUntil = 0;
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
  "urgency": "CRITICAL" | "MODERATE" | "ROUTINE",
  "volatilityScore": 85,
  "keyPoints": [
    { "badge": "SHORT_BADGE", "text": "High-impact takeaway or finding" }
  ],
  "deadlines": [
    { "title": "Milestone name", "date": "Date string or deadline", "urgency": "HIGH" | "MEDIUM" | "LOW" }
  ],
  "actionRequired": "Concrete next step for a candidate/beneficiary/citizen, or null if no action needed."
}

Rules:
- Urgency: "CRITICAL" if imminent deadline (<7 days), postponement, cancellation, legal stay, or urgent action needed. "MODERATE" if new release, admit card, or active development. "ROUTINE" for standard periodic updates.
- VolatilityScore: Integer from 1 to 100 representing how dynamic or fast-moving the recent updates are.
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
        let urgency = typeof parsed.urgency === 'string' ? parsed.urgency.toUpperCase().trim() : null;
        if (!['CRITICAL', 'MODERATE', 'ROUTINE'].includes(urgency)) {
          const hasHighDeadline = Array.isArray(parsed.deadlines) && parsed.deadlines.some((d) => d.urgency === 'HIGH');
          urgency = hasHighDeadline ? 'CRITICAL' : 'MODERATE';
        }
        const volatilityScore = typeof parsed.volatilityScore === 'number'
          ? Math.min(100, Math.max(1, Math.round(parsed.volatilityScore)))
          : (urgency === 'CRITICAL' ? 85 : urgency === 'MODERATE' ? 55 : 25);

        return {
          coreStatus: parsed.coreStatus.trim(),
          urgency,
          volatilityScore,
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

  function createFallbackStructuredDiff(topic, rawSummary = '', sourceUrls = []) {
    const text = String(rawSummary || '').trim();
    const isCritical = /deadline|last date|cancel|postpone|stay order|court order|cutoff|hall ticket|admit card|urgent|scheduled|verdict/i.test(text);
    const isModerate = /extend|release|announced|update|fee|apply|eligibility|new result|decision|notification/i.test(text);
    const impact = isCritical ? 'HIGH' : isModerate ? 'MEDIUM' : 'LOW';

    let before = null;
    let after = null;
    if (text.includes(' → ')) {
      const parts = text.split(' → ');
      before = parts[0].replace(/^.*:\s*/, '').trim();
      after = parts[1].split('\n')[0].replace(/^.*:\s*/, '').trim();
    }

    const evidence = (sourceUrls || []).slice(0, 3).map((url) => {
      let domain = 'source';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      const isGov = /\.(gov|nic|ac|edu)\.in$|\.gov$|court|judicature/i.test(domain);
      return {
        title: `${topic.name} Source Document`,
        url,
        domain,
        sourceType: isGov ? 'Official Portal' : 'Public Web Source',
        date: null,
        excerpt: text.slice(0, 200) || 'Verified search result match.',
      };
    });

    const headline = text.includes('\n')
      ? text.split('\n')[0].replace(/^.*:\s*/, '').slice(0, 90)
      : (text.length > 90 ? `${text.slice(0, 87)}…` : (text || `${topic.name} Update Detected`));

    return {
      headline: headline || `${topic.name} Update Detected`,
      explanation: text || 'Public notice radar detected fresh updates in search and news feeds.',
      before,
      after,
      whyItMatters: isCritical
        ? 'Directly impacts submission deadlines, eligibility criteria, or critical next actions.'
        : 'Provides updated intelligence on administrative announcements and candidate requirements.',
      whoIsAffected: `Candidates, beneficiaries, and stakeholders following ${topic.name}.`,
      actionRequired: isCritical ? 'Review updated guidelines and verify notices on the official portal.' : null,
      impact,
      whyAmISeeingThis: [
        `Matches your monitored search query: "${topic.query}"`,
        evidence.some((e) => e.sourceType === 'Official Portal') ? 'Verified official publication detected' : 'Detected in active web search & news index',
      ],
      evidence,
    };
  }

  /**
   * Explains what changed between two snapshots in clean, human-readable English for alerts and timelines.
   */
  async function generateDiffSummary(topic, { previous, current, rawSummary, diffResult } = {}) {
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

  /**
   * Generates a fully-structured AI change analysis (Priority 1) with Before/After, Impact,
   * Evidence, Why it matters, and Grounded Relevance.
   */
  async function generateStructuredDiff(topic, { previous, current, rawSummary, diffResult } = {}) {
    const sourceUrls = diffResult?.sourceUrls || [];
    if (keyPool.length === 0) {
      return createFallbackStructuredDiff(topic, rawSummary, sourceUrls);
    }

    const prevItems = [
      ...(previous?.search || []).slice(0, 3).map((s) => ({ title: s.title, snippet: s.snippet })),
      ...(previous?.news || []).slice(0, 3).map((n) => ({ title: n.title })),
    ];

    const currItems = [
      ...(current?.search || []).slice(0, 4).map((s) => ({ title: s.title, snippet: s.snippet, link: s.link, date: s.date })),
      ...(current?.news || []).slice(0, 4).map((n) => ({ title: n.title, link: n.link, source: n.source, date: n.date })),
    ];

    const candidateSources = (currItems || []).map((item) => {
      let domain = 'source';
      try { domain = new URL(item.link).hostname.replace(/^www\./, ''); } catch {}
      const isGov = /\.(gov|nic|ac|edu)\.in$|\.gov$|court|judicature/i.test(domain);
      return {
        title: item.title,
        url: item.link,
        domain,
        sourceType: isGov ? 'Official Portal' : 'News Bulletin',
        date: item.date || null,
        excerpt: item.snippet || item.title || null,
      };
    }).filter((s) => s.url);

    const prompt = `You are a real-time intelligence analyst monitoring official notifications, exams, and government schemes.
Analyze the following change detection data for topic "${topic.name}" (Query: "${topic.query}").

Raw Engine Delta:
"${rawSummary || 'New records detected'}"

Previous Snapshot State:
${JSON.stringify(prevItems, null, 2)}

Current Snapshot State:
${JSON.stringify(currItems, null, 2)}

Verified Source Candidates:
${JSON.stringify(candidateSources.slice(0, 5), null, 2)}

Return a JSON object with this exact schema:
{
  "headline": "Short title describing the change (e.g. Application deadline changed)",
  "explanation": "Clear 1-2 sentence human-readable explanation of what changed.",
  "before": "Previous date, status or number, or null if not explicitly known",
  "after": "New date, status or number, or null if not explicitly known",
  "whyItMatters": "Practical significance for the applicant or citizen in 1 sentence.",
  "whoIsAffected": "Target group affected (e.g. Registered applicants), or null if general",
  "actionRequired": "Concrete next step if supported by sources, otherwise null",
  "impact": "HIGH" | "MEDIUM" | "LOW",
  "whyAmISeeingThis": [
    "Bullet 1 explaining why this matched user's monitor",
    "Bullet 2 explaining source authority or relevance"
  ],
  "evidence": [
    {
      "title": "Source title from candidates",
      "url": "Exact URL from candidates",
      "domain": "Domain name",
      "sourceType": "Official Portal" | "News Bulletin" | "Web Source",
      "date": "Publication date or null",
      "excerpt": "Specific relevant sentence from source"
    }
  ]
}

STRICT CONSTRAINTS:
1. Do NOT invent facts or dates not present in the retrieved records.
2. If before or after details cannot be reliably extracted, set them to null.
3. If no immediate action is supported, set actionRequired to null.
4. Set impact to "HIGH" for deadlines, cancellations, eligibility changes, or hall tickets; "MEDIUM" for extensions or new circulars; "LOW" for routine status updates.
5. Return ONLY the JSON object.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const rawJson = await callGemini(payload);
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed?.headline && parsed?.explanation) {
          const impact = ['HIGH', 'MEDIUM', 'LOW'].includes(parsed.impact?.toUpperCase())
            ? parsed.impact.toUpperCase()
            : 'MEDIUM';
          return {
            headline: String(parsed.headline).trim(),
            explanation: String(parsed.explanation).trim(),
            before: parsed.before ? String(parsed.before).trim() : null,
            after: parsed.after ? String(parsed.after).trim() : null,
            whyItMatters: parsed.whyItMatters ? String(parsed.whyItMatters).trim() : 'Monitored parameter updated.',
            whoIsAffected: parsed.whoIsAffected ? String(parsed.whoIsAffected).trim() : null,
            actionRequired: parsed.actionRequired ? String(parsed.actionRequired).trim() : null,
            impact,
            whyAmISeeingThis: Array.isArray(parsed.whyAmISeeingThis) && parsed.whyAmISeeingThis.length > 0
              ? parsed.whyAmISeeingThis.slice(0, 3)
              : [`Matches query "${topic.query}"`, 'Detected in recent intelligence snapshot'],
            evidence: Array.isArray(parsed.evidence) && parsed.evidence.length > 0
              ? parsed.evidence.slice(0, 4)
              : candidateSources.slice(0, 2),
          };
        }
      } catch (err) {
        logger.warn(`Failed to parse structured diff JSON from Gemini: ${err.message}`);
      }
    }

    return createFallbackStructuredDiff(topic, rawSummary, sourceUrls);
  }

  /**
   * Natural-language monitor creation (Priority 6):
   * Extracts topic name, optimized query, category, and watch preferences from free-form user intent.
   */
  async function parseNaturalLanguageTopic(userInput) {
    const input = String(userInput || '').trim();
    if (!input) return null;

    if (keyPool.length === 0) {
      // Offline fallback: rule-based extractor
      const name = input.replace(/^(monitor|track|watch|notify me about|alert me for)\s+/i, '').slice(0, 60);
      const isExam = /exam|gate|upsc|jee|neet|cgl|admit|cutoff/i.test(input);
      const isScheme = /scheme|yojana|subsidy|pension|kisan/i.test(input);
      const isRecruitment = /job|recruitment|vacancy|hiring/i.test(input);
      const isCase = /case|court|order|verdict|bench|high court|supreme court/i.test(input);
      const category = isExam ? 'exam' : isScheme ? 'scheme' : isRecruitment ? 'recruitment' : isCase ? 'case' : 'other';
      return {
        name: name || 'Custom Monitor',
        query: `${name} official notification updates`,
        category,
        watchFocus: ['Official updates', 'Important deadlines', 'Public circulars'],
        suggestedSources: ['Official websites', 'Relevant national news'],
        summary: `Monitoring updates and circulars for ${name}.`,
      };
    }

    const prompt = `You are an AI assistant for Notice Me, a public notice radar in India.
A user entered this natural language request to create a monitor:
"${input}"

Extract the monitoring intent into a clean JSON object with this exact structure:
{
  "name": "Short, clear topic title (1-6 words, e.g. GATE 2027)",
  "query": "Optimized Google Search & News query string without boolean operators (e.g. GATE 2027 application deadline eligibility exam date)",
  "category": "scheme" | "exam" | "recruitment" | "case" | "policy" | "admission" | "other",
  "watchFocus": [
    "Application deadlines",
    "Eligibility criteria",
    "Exam dates"
  ],
  "suggestedSources": [
    "Official website (gate.iitk.ac.in)",
    "National education news"
  ],
  "summary": "1-sentence summary of what Notice Me will monitor."
}

Rules:
- Category MUST be one of: scheme, exam, recruitment, case, policy, admission, other.
- The query should include key official search terms likely to match press releases and circulars.
- Return ONLY the JSON object.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    };

    const rawJson = await callGemini(payload);
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed?.name && parsed?.query) {
          const allowedCategories = ['scheme', 'exam', 'recruitment', 'case', 'policy', 'admission', 'other'];
          const category = allowedCategories.includes(parsed.category) ? parsed.category : 'other';
          return {
            name: String(parsed.name).trim().slice(0, 120),
            query: String(parsed.query).trim().slice(0, 500),
            category,
            watchFocus: Array.isArray(parsed.watchFocus) ? parsed.watchFocus.slice(0, 4) : ['Key deadlines', 'Official notices'],
            suggestedSources: Array.isArray(parsed.suggestedSources) ? parsed.suggestedSources.slice(0, 3) : ['Official portals', 'Verified news'],
            summary: parsed.summary ? String(parsed.summary).trim() : `Monitoring ${parsed.name} for official notices.`,
          };
        }
      } catch (err) {
        logger.warn(`Failed to parse natural language topic JSON: ${err.message}`);
      }
    }

    return null;
  }

  /**
   * AI Chat Assistant over monitored data (Priority 8):
   * Strictly answers user questions using stored snapshots, diff summaries, and source evidence.
   */
  async function queryMonitoredChat({ question, topic, topics = [], diffs = [], snapshots = [], history = [] } = {}) {
    const q = String(question || '').trim();
    if (!q) throw new Error('Question is required.');

    function parseStoredDiff(d) {
      let structured = null;
      const summaryStr = String(d.summary || '').trim();
      if (summaryStr.startsWith('{') && summaryStr.endsWith('}')) {
        try {
          const parsed = JSON.parse(summaryStr);
          if (parsed && (parsed.headline || parsed.explanation)) {
            structured = parsed;
          }
        } catch {}
      }
      return {
        id: d.id,
        topicName: d.topic?.name || topic?.name || 'Monitored Topic',
        detectedAt: d.detectedAt,
        headline: structured?.headline || summaryStr.slice(0, 140),
        before: structured?.before || null,
        after: structured?.after || null,
        whyItMatters: structured?.whyItMatters || null,
        whoIsAffected: structured?.whoIsAffected || null,
        actionRequired: structured?.actionRequired || null,
        rawSummary: summaryStr,
        sourceUrls: d.sourceUrls || [],
      };
    }

    function formatSnapshot(s) {
      const raw = s.rawData || {};
      return {
        topicName: s.topic?.name || topic?.name || 'Monitored Topic',
        topicQuery: s.topic?.query || topic?.query || '',
        pulledAt: s.pulledAt,
        aiBriefing: raw.aiBriefing ? {
          status: raw.aiBriefing.coreStatus,
          urgency: raw.aiBriefing.urgency,
          deadlines: raw.aiBriefing.deadlines,
          actionRequired: raw.aiBriefing.actionRequired,
        } : null,
        overview: raw.overview?.text || null,
        topSearchSnippets: (raw.search || []).slice(0, 5).map((item) => ({
          title: item.title,
          snippet: item.snippet,
          link: item.link,
        })),
        topNewsBulletins: (raw.news || []).slice(0, 5).map((item) => ({
          title: item.title,
          source: item.source,
          snippet: item.snippet,
          link: item.link,
          date: item.date,
        })),
      };
    }

    const contextData = {
      activeTopic: topic ? { id: topic.id, name: topic.name, query: topic.query, category: topic.category } : null,
      allTopics: topics.map((t) => ({ id: t.id, name: t.name, query: t.query })),
      recentDiffs: diffs.slice(0, 15).map(parseStoredDiff),
      recentSnapshots: snapshots.slice(0, 8).map(formatSnapshot),
    };

    function buildGroundedFallback(questionStr, ctx) {
      const qLower = questionStr.toLowerCase();
      // 1. Look for matching diffs
      const matchedDiff = ctx.recentDiffs.find((d) =>
        d.rawSummary.toLowerCase().includes(qLower) ||
        (d.headline && d.headline.toLowerCase().includes(qLower)) ||
        (d.topicName && d.topicName.toLowerCase().includes(qLower))
      );
      if (matchedDiff) {
        let text = `**${matchedDiff.topicName} Update:** ${matchedDiff.headline}\n\n`;
        if (matchedDiff.before && matchedDiff.after) {
          text += `• **Before:** ${matchedDiff.before}\n• **After:** ${matchedDiff.after}\n`;
        }
        if (matchedDiff.whyItMatters) {
          text += `• **Why it matters:** ${matchedDiff.whyItMatters}\n`;
        }
        if (matchedDiff.actionRequired) {
          text += `• **Recommended Action:** ${matchedDiff.actionRequired}\n`;
        }
        return {
          answer: text.trim(),
          sources: (matchedDiff.sourceUrls || []).map((u) => ({ url: u })),
          grounded: true,
        };
      }

      // 2. Look for matching snapshot info
      for (const snap of ctx.recentSnapshots) {
        const matchTopic = snap.topicName.toLowerCase().includes(qLower) || snap.topicQuery.toLowerCase().includes(qLower);
        if (matchTopic || ctx.activeTopic) {
          if (snap.aiBriefing?.status) {
            return {
              answer: `**Current Status for ${snap.topicName}:**\n${snap.aiBriefing.status}\n\n${snap.aiBriefing.actionRequired ? `• **Action Required:** ${snap.aiBriefing.actionRequired}\n` : ''}${snap.aiBriefing.deadlines?.length ? `• **Key Deadlines:** ${snap.aiBriefing.deadlines.map(d => `${d.title} (${d.date})`).join(', ')}` : ''}`.trim(),
              sources: snap.topSearchSnippets.slice(0, 3).map((s) => ({ url: s.link })),
              grounded: true,
            };
          }
          if (snap.topNewsBulletins.length || snap.topSearchSnippets.length) {
            const topItem = snap.topNewsBulletins[0] || snap.topSearchSnippets[0];
            return {
              answer: `**Latest Intelligence for ${snap.topicName}:**\n${topItem.title}${topItem.snippet ? `\n\n"${topItem.snippet}"` : ''}\n\n*No breaking changes detected yet. Continuous radar is actively monitoring official sources.*`,
              sources: [topItem.link].filter(Boolean).map((u) => ({ url: u })),
              grounded: true,
            };
          }
        }
      }

      // 3. General overview
      if (ctx.allTopics.length > 0) {
        return {
          answer: `I am actively monitoring **${ctx.allTopics.length} topic(s)** for you: ${ctx.allTopics.map(t => t.name).join(', ')}.\n\nAsk me about the status, deadlines, or recent changes for any of these notices!`,
          sources: [],
          grounded: true,
        };
      }

      return {
        answer: "I cannot find this information in your monitored topics or recorded updates.",
        sources: [],
        grounded: false,
      };
    }

    if (keyPool.length === 0) {
      return buildGroundedFallback(q, contextData);
    }

    const conversationPrompt = Array.isArray(history) && history.length > 0
      ? `Prior Conversation:\n${history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n')}\n\n`
      : '';

    const prompt = `You are Notice Me AI Analyst, an intelligent grounded copilot for monitored Indian public notices, exams, and schemes.
Answer the user's question directly, accurately, and helpfully using ONLY the facts and updates in the Monitored Data Context.

${conversationPrompt}User Question: "${q}"

Monitored Data Context:
${JSON.stringify(contextData, null, 2)}

Strict Grounding & Answer Rules:
1. Ground your answer in the Monitored Data Context. Utilize both the recent change diffs AND the latest snapshot search/news snippets and briefings.
2. If there are no diffs recorded yet (initial baseline), explain the current verified status from the latest search snippets or news bulletins.
3. If specific information (like an unannounced date or unknown detail) is not in the context, explicitly say:
   "I cannot find this information in your monitored topics or recorded updates."
4. Highlight key dates, Before → After changes, and practical impacts clearly.
5. Format your response cleanly with markdown bolding (**date / topic**), bullet lists, and section headers where appropriate.
6. Include any relevant source URLs directly in your answer so the user can verify them.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 750,
      },
    };

    const answerText = await callGemini(payload);
    if (!answerText) {
      return buildGroundedFallback(q, contextData);
    }

    // Extract any URLs cited or referenced
    const citedUrls = [];
    const urlRegex = /https?:\/\/[^\s)\]]+/g;
    let match;
    while ((match = urlRegex.exec(answerText)) !== null) {
      citedUrls.push(match[0]);
    }

    return {
      answer: answerText.trim(),
      sources: [...new Set(citedUrls)].slice(0, 5).map((url) => {
        let domain = 'source';
        try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
        return { url, domain };
      }),
      grounded: true,
    };
  }

  return {
    generateBriefing,
    generateDiffSummary,
    generateStructuredDiff,
    parseNaturalLanguageTopic,
    queryMonitoredChat,
    createFallbackStructuredDiff,
    getKeyCount: () => keyPool.length,
    getActiveKeyIndex: () => (keyPool[keyOffset] ? keyPool[keyOffset].index : null),
  };
}

