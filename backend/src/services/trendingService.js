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

/**
 * Pre-warms and updates public trending radar data with SerpApi and Gemini.
 * Scheduled to run 15 minutes before 8 AM, 2 PM, and 8 PM (7:45, 13:45, 19:45 IST).
 */
export async function refreshTrendingRadar({ client, gemini, logger = console } = {}) {
  const apiClient = client || createSerpApiClient();
  const geminiClient = gemini !== undefined ? gemini : getGeminiClient();

  logger.info(`Trending Radar: Starting pre-warm refresh for ${BASE_TRENDING.length} public tracks...`);
  let successCount = 0;

  for (const track of BASE_TRENDING) {
    try {
      const rawData = await apiClient.pullSnapshot(track.query);
      let aiBriefing = null;
      if (geminiClient) {
        aiBriefing = await geminiClient.generateBriefing(track, rawData).catch(() => null);
      }

      // Update cached item
      const index = cachedTrending.findIndex((t) => t.id === track.id);
      if (index >= 0) {
        const topNews = rawData.news?.[0];
        cachedTrending[index] = {
          ...cachedTrending[index],
          headline: aiBriefing?.coreStatus || topNews?.title || cachedTrending[index].headline,
          aiBriefing: aiBriefing || cachedTrending[index].aiBriefing,
          lastRefreshed: new Date().toISOString(),
        };
      }
      successCount++;
    } catch (err) {
      logger.warn(`Trending Radar: refresh for ${track.name} skipped: ${err.message}`);
    }
  }

  logger.info(`Trending Radar: Pre-warm completed (${successCount}/${BASE_TRENDING.length} refreshed).`);
  return { refreshed: successCount, total: BASE_TRENDING.length };
}
