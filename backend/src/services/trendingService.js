import { createSerpApiClient } from '../../../scripts/serpapi-client.js';
import { getGeminiClient } from './geminiService.js';

export const BASE_TRENDING = [
  {
    id: 'trend-upsc-2026',
    name: 'UPSC CSE 2026',
    query: 'UPSC CSE 2026 prelims notification exam date upsc.gov.in',
    category: 'exam',
    badge: '🔥 #1 IN EXAMS',
    headline: 'Prelims Exam Scheduled for May 24, 2026 — Official Notification Timeline Confirmed',
    officialSource: 'upsc.gov.in',
    followers: 0,
    urgency: 'HIGH',
    description: 'Live radar tracking official UPSC notification, online registration window, vacancy count, and admit card releases.',
  },
  {
    id: 'trend-pm-kisan-19',
    name: 'PM-KISAN 19th Installment',
    query: 'PM Kisan 19th installment release date eligibility list pmkisan.gov.in',
    category: 'scheme',
    badge: '🌾 #1 GOVT SCHEME',
    headline: '19th Installment of ₹2,000 Direct Benefit Transfer Dispatched to 9.5+ Crore Beneficiary Accounts',
    officialSource: 'pmkisan.gov.in',
    followers: 0,
    urgency: 'CRITICAL',
    description: 'Tracking mandatory e-KYC deadlines, Aadhaar bank seeding verification, and state-wise beneficiary installment status.',
  },
  {
    id: 'trend-neet-pg-2026',
    name: 'NEET PG 2026',
    query: 'NEET PG 2026 exam date counseling schedule nbe.edu.in mcc.nic.in',
    category: 'exam',
    badge: '⚡ BREAKING RADAR',
    headline: 'National Board of Examinations Issues Revised Schedule & Eligibility Cut-off Guidelines',
    officialSource: 'nbe.edu.in / mcc.nic.in',
    followers: 0,
    urgency: 'HIGH',
    description: 'Monitoring NBEMS notifications, seat matrix allocation, registration portal openings, and Supreme Court petition updates.',
  },
  {
    id: 'trend-sci-electoral-bonds',
    name: 'Supreme Court Electoral Bonds',
    query: 'Supreme Court Electoral Bonds compliance hearing judgment sci.gov.in',
    category: 'case',
    badge: '⚖️ CONSTITUTION BENCH',
    headline: 'Constitution Bench Schedules Compliance Review & Disclosure Bench Proceedings',
    officialSource: 'sci.gov.in',
    followers: 0,
    urgency: 'HIGH',
    description: 'Live court bulletin monitoring Constitution Bench hearings, SBI disclosure submissions, and final registry orders.',
  },
  {
    id: 'trend-agniveer-rally',
    name: 'Indian Army Agniveer Rally 2026',
    query: 'Indian Army Agniveer rally notification 2026 joinindianarmy.nic.in',
    category: 'recruitment',
    badge: '🎖️ TOP RECRUITMENT',
    headline: 'Zone-Wise Rally Schedule & Common Entrance Exam (CEE) Computer-Based Test Released',
    officialSource: 'joinindianarmy.nic.in',
    followers: 0,
    urgency: 'HIGH',
    description: 'Monitoring zone-wise physical rally dates, admit cards, qualification cut-offs, and CEE merit list announcements.',
  },
  {
    id: 'trend-cbse-board-2026',
    name: 'CBSE Board Exam 2026',
    query: 'CBSE class 10 12 board exam date sheet timetable 2026 cbse.gov.in',
    category: 'exam',
    badge: '📚 EDUCATION RADAR',
    headline: 'Central Board of Secondary Education Releases Practical & Theory Examination Timetable',
    officialSource: 'cbse.gov.in',
    followers: 0,
    urgency: 'MEDIUM',
    description: 'Tracking subject-wise date sheets, sample question papers, center guidelines, and internal assessment portals.',
  },
  {
    id: 'trend-rbi-repo-rate',
    name: 'RBI Monetary Policy & Repo Rate',
    query: 'RBI monetary policy committee MPC repo rate decision rbi.org.in',
    category: 'policy',
    badge: '📈 FINANCE & ECONOMY',
    headline: 'Monetary Policy Committee Keeps Benchmark Repo Rate at 6.5% with Focus on Inflation Stance',
    officialSource: 'rbi.org.in',
    followers: 0,
    urgency: 'MEDIUM',
    description: 'Tracking bi-monthly MPC decisions, bank home/auto loan EMI interest impact, and liquidity circulars.',
  },
  {
    id: 'trend-aadhaar-pan-linking',
    name: 'Aadhaar-PAN Linking Compliance',
    query: 'Aadhaar PAN link deadline penalty status incometax.gov.in',
    category: 'policy',
    badge: '🚨 DEADLINE ADVISORY',
    headline: 'Income Tax Department Issues Advisory on Inoperative PAN Status and TDS Deductions',
    officialSource: 'incometax.gov.in',
    followers: 0,
    urgency: 'HIGH',
    description: 'Monitoring e-filing linking fee window, penalty exemptions, and banking transaction restrictions.',
  },
];

let cachedTrending = BASE_TRENDING.map((t) => ({ ...t, lastRefreshed: null }));

export function getCachedTrending() {
  return cachedTrending;
}

function titleCase(str) {
  if (!str) return '';
  return str.split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function mapTrendCategory(serpCategories = [], query = '') {
  const q = query.toLowerCase();
  if (/exam|test|admit|result|score|board|cbse|upsc|neet|jee|ssc|admission|counseling|seat matrix|hall ticket/i.test(q)) return 'exam';
  if (/scheme|yojana|subsidy|kisan|dbt|fund|pension|welfare/i.test(q)) return 'scheme';
  if (/recruit|vacancy|rally|army|police|constable|agniveer|post/i.test(q)) return 'recruitment';
  if (/court|bench|judge|verdict|bail|case|hearing|petition|law/i.test(q)) return 'case';
  if (/policy|rbi|tax|repo|gst|pan|aadhaar|guideline|commission|rule|order|government|ministry/i.test(q)) return 'policy';

  const catNames = serpCategories.map((c) => c.name);
  if (catNames.includes('Jobs and Education')) return 'exam';
  if (catNames.includes('Law and Government')) return 'case';
  if (catNames.includes('Politics') || catNames.includes('Business and Finance')) return 'policy';
  return 'other';
}

function formatTrendBadge(item) {
  const vol = item.search_volume;
  const inc = item.increase_percentage;
  if (vol && vol >= 100000) return `🔥 ${(vol / 1000).toFixed(0)}K+ SEARCHES`;
  if (inc && inc >= 500) return `⚡ +${inc}% BREAKOUT`;
  if (vol && vol >= 10000) return `📈 ${(vol / 1000).toFixed(0)}K+ SEARCHES`;
  return `⚡ BREAKING RADAR`;
}

export function parseSerpTrendsToTopics(searches = []) {
  if (!Array.isArray(searches) || searches.length === 0) return [];
  const relevantCats = ['Jobs and Education', 'Law and Government', 'Politics', 'Business and Finance', 'Science', 'Climate'];
  const keywords = /exam|admit|result|notification|scheme|yojana|recruitment|court|police|army|board|cbse|upsc|neet|commission|policy|tax|pan|aadhaar|matrix|counseling|order|subsidy|buses|rate|rbi|bank|seat|bill|railway/i;

  const filtered = searches.filter((s) => {
    const isRelCat = s.categories?.some((c) => relevantCats.includes(c.name));
    const isKeyword = keywords.test(s.query) || s.trend_breakdown?.some((b) => keywords.test(b));
    return isRelCat || isKeyword;
  });

  return filtered.slice(0, 10).map((s, idx) => {
    const rawName = s.trend_breakdown?.[0] || s.query;
    const name = titleCase(rawName);
    const category = mapTrendCategory(s.categories, `${s.query} ${rawName}`);
    const slug = s.query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `trend-${idx}`;
    return {
      id: `trend-live-${slug}`,
      name,
      query: `${rawName} official updates`,
      category,
      badge: formatTrendBadge(s),
      headline: s.trend_breakdown?.length
        ? `Surge in searches for ${s.trend_breakdown.slice(0, 2).join(' and ')}`
        : `High search volume detected on Google Trends (${(s.search_volume || 0).toLocaleString()} searches)`,
      officialSource: 'Google Trends (India Live Radar)',
      followers: 0,
      urgency: (s.search_volume || 0) >= 50000 ? 'CRITICAL' : 'HIGH',
      description: `Live search surge detected via SerpApi Google Trends with ${(s.search_volume || 0).toLocaleString()} search volume.`,
      lastRefreshed: new Date().toISOString(),
    };
  });
}

/**
 * Pre-warms and updates public trending radar data with SerpApi and Gemini.
 * Scheduled to run 15 minutes before 8 AM, 2 PM, and 8 PM (7:45, 13:45, 19:45 IST).
 */
export async function refreshTrendingRadar({ client, gemini, logger = console, geo = 'IN' } = {}) {
  const apiClient = client || createSerpApiClient();
  const geminiClient = gemini !== undefined ? gemini : getGeminiClient();

  logger.info(`Trending Radar: Checking live Google Trends via SerpApi...`);
  let activeTracks = BASE_TRENDING;

  if (typeof apiClient.googleTrendsNow === 'function') {
    try {
      const liveSearches = await apiClient.googleTrendsNow({ geo });
      const parsed = parseSerpTrendsToTopics(liveSearches);
      if (parsed.length > 0) {
        activeTracks = parsed;
        logger.info(`Trending Radar: Discovered ${parsed.length} live trending public notices from SerpApi.`);
      }
    } catch (err) {
      logger.warn(`Trending Radar: SerpApi google_trends_trending_now failed: ${err.message}. Using baseline.`);
    }
  }

  logger.info(`Trending Radar: Starting pre-warm refresh for ${activeTracks.length} public tracks...`);
  let successCount = 0;
  const updatedTracks = [];

  for (const track of activeTracks) {
    try {
      const rawData = await apiClient.pullSnapshot(track.query);
      let aiBriefing = null;
      if (geminiClient) {
        aiBriefing = await geminiClient.generateBriefing(track, rawData).catch(() => null);
      }

      const topNews = rawData.news?.[0];
      const topSearch = rawData.search?.[0];
      let sourceDomain = track.officialSource;
      if (topSearch?.link) {
        try { sourceDomain = new URL(topSearch.link).hostname.replace(/^www\./, ''); } catch {}
      }

      updatedTracks.push({
        ...track,
        headline: aiBriefing?.coreStatus || topNews?.title || track.headline,
        aiBriefing: aiBriefing || null,
        officialSource: sourceDomain,
        description: aiBriefing?.summary || topNews?.snippet || topSearch?.snippet || track.description,
        lastRefreshed: new Date().toISOString(),
      });
      successCount++;
    } catch (err) {
      logger.warn(`Trending Radar: refresh for ${track.name} skipped: ${err.message}`);
      updatedTracks.push({ ...track, lastRefreshed: new Date().toISOString() });
    }
  }

  if (updatedTracks.length > 0) {
    cachedTrending = updatedTracks;
  }

  logger.info(`Trending Radar: Pre-warm completed (${successCount}/${activeTracks.length} refreshed).`);
  return { refreshed: successCount, total: activeTracks.length };
}
