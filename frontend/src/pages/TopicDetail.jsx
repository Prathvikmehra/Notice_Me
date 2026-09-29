import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getLatestSnapshot, getTimeline, updateAlertSettings, syncTopic } from '../api/client.js';
import TimelineView from '../components/TimelineView.jsx';

export default function TopicDetail({ topic, onDelete, onAlertChange, refreshToken }) {
  const { user } = useAuth();
  const [diffs, setDiffs] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [enabled, setEnabled] = useState(Boolean(topic.alertEnabled));
  const [frequency] = useState(topic.alertFrequency || '3h');
  const [alertHour, setAlertHour] = useState(topic.alertHour ?? 12);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEnabled(Boolean(topic.alertEnabled));
    setAlertHour(topic.alertHour ?? 12);
  }, [topic.alertEnabled, topic.alertHour]);
  useEffect(() => { setMessage(''); }, [topic.id]);
  useEffect(() => {
    let active = true;
    let pollTimer;
    setLoading(true);
    setError('');

    function loadData(isPoll = false) {
      return Promise.all([getTimeline(topic.id), getLatestSnapshot(topic.id)]).then(([timeline, latest]) => {
        if (!active) return;
        setDiffs(timeline.diffs);
        setSnapshot(latest.snapshot);
        if (!latest.snapshot && !isPoll) {
          pollTimer = setTimeout(() => {
            if (active) loadData(true);
          }, 3000);
        }
      }).catch((cause) => {
        if (active) setError(cause.message);
      }).finally(() => {
        if (active && !isPoll) setLoading(false);
      });
    }

    loadData();

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [topic.id, refreshToken]);

  async function handleSync() {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const res = await syncTopic(topic.id);
      if (res?.snapshot) setSnapshot(res.snapshot);
      const timeline = await getTimeline(topic.id);
      setDiffs(timeline.diffs);
      setMessage(res?.message || 'Live data refreshed from Google & News.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSyncing(false);
    }
  }

  async function saveAlerts(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateAlertSettings(topic.id, {
        email: enabled ? (user?.email || topic.alertEmail) : null,
        alertEnabled: enabled,
        alertFrequency: frequency,
        alertHour: enabled ? Number(alertHour) : null,
        alertDays: 'weekdays',
      });
      onAlertChange(updated);
      const hourLabel = alertHour === 12 ? '12 PM' : alertHour === 0 ? '12 AM' : alertHour > 12 ? `${alertHour - 12} PM` : `${alertHour} AM`;
      setMessage(updated.alertEnabled ? `Alerts scheduled for ${hourLabel} on weekdays.` : 'Alerts disabled.');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  const results = snapshot?.rawData;
  const lastPull = snapshot?.pulledAt && new Date(snapshot.pulledAt);
  const briefing = getLiveBriefing(results, topic);
  return (
    <div className="detail">
      <div className="detail-header">
        <div>
          <div className="eyebrow">
            <span className="category-badge">{topic.category || 'General Notice'}</span>
            <span>Ref #{topic.id.slice(0, 8)}</span>
          </div>
          <h1>{topic.name}</h1>
          <p className="query">
            <span className="query-prefix">Search query:</span> “{topic.query}”
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`button button-sync ${syncing ? 'is-syncing' : ''}`}
            onClick={handleSync}
            disabled={syncing || busy}
            title="Fetch latest Google Search & News results now"
          >
            {syncing ? '⚡ Syncing…' : '⚡ Sync Live Data'}
          </button>
          <button type="button" className="button button-danger delete-button" onClick={() => onDelete(topic)}>
            Remove notice
          </button>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span>LAST CHECKED</span>
          <strong>{lastPull && !Number.isNaN(lastPull.getTime()) ? lastPull.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (syncing ? 'Syncing now…' : 'Pending baseline pull')}</strong>
        </div>
        <div className="metric">
          <span>SEARCH SOURCES</span>
          <strong>{results?.search?.length ?? (syncing ? '…' : '0')}</strong>
        </div>
        <div className="metric">
          <span>NEWS SOURCES</span>
          <strong>{results?.news?.length ?? (syncing ? '…' : '0')}</strong>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}

      {briefing && (
        <section className="briefing-card" aria-labelledby="briefing-heading">
          <div className="briefing-header">
            <div className="briefing-tag">
              <span className="live-pulse" />
              <span>{briefing.tag}</span>
            </div>
            <span className="briefing-source-tag">SERPAPI REAL-TIME INTELLIGENCE</span>
          </div>

          <div className="briefing-summary-box">
            <div className="briefing-box-label">
              <span className="summary-icon">✦</span>
              <span>VERIFIED STATUS OVERVIEW</span>
            </div>
            <p className="briefing-summary-text">{briefing.coreStatus}</p>
            {briefing.primarySource && (
              <a
                href={briefing.primarySource.link}
                target="_blank"
                rel="noopener noreferrer"
                className="briefing-source-link"
              >
                Primary Source: <span>{briefing.primarySource.name}</span> ↗
              </a>
            )}
          </div>

          {briefing.keyPoints.length > 0 && (
            <div className="briefing-highlights-box">
              <div className="briefing-box-label">
                <span>KEY VERIFIED HIGHLIGHTS</span>
              </div>
              <ul className="briefing-highlights-list">
                {briefing.keyPoints.map((pt, idx) => (
                  <li key={idx} className="highlight-item">
                    <span className="highlight-badge">{pt.badge}</span>
                    <span className="highlight-text">{pt.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {briefing.bulletins.length > 0 && (
            <div className="briefing-bulletins">
              <div className="bulletins-header">
                <span>ACTIVE MEDIA RADAR & TOP BULLETINS</span>
              </div>
              <div className="bulletins-grid">
                {briefing.bulletins.map((b, idx) => (
                  <a
                    key={idx}
                    href={b.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bulletin-card"
                  >
                    <div className="bulletin-meta">
                      <span className={`bulletin-badge ${b.type.includes('NEWS') ? 'news' : 'record'}`}>
                        {b.type}
                      </span>
                      {b.date && <span className="bulletin-date">{b.date}</span>}
                    </div>
                    <div className="bulletin-title">{b.title}</div>
                    {b.snippet ? <div className="bulletin-snippet">{b.snippet}</div> : null}
                    <div className="bulletin-source">
                      <span>{b.source}</span>
                      <span className="bulletin-arrow">↗</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {!briefing && !loading && (
        <section className="briefing-card" aria-labelledby="briefing-heading">
          <div className="briefing-header">
            <div className="briefing-tag">
              <span className="live-pulse" />
              <span>{syncing ? 'GATHERING LIVE INTELLIGENCE' : 'INITIAL SCAN PENDING'}</span>
            </div>
            <span className="briefing-source-tag">SERPAPI REAL-TIME INTELLIGENCE</span>
          </div>
          <div className="briefing-summary-box">
            <p className="briefing-summary-text">
              {syncing
                ? 'Connecting to SerpApi to index Google Search and Google News records for this query…'
                : 'Initial baseline has not been recorded yet. Click “⚡ Sync Live Data” above to fetch real-time intelligence immediately.'}
            </p>
          </div>
        </section>
      )}

      <TimelineView diffs={diffs} loading={loading} />
      <section className="settings-card" aria-labelledby="alert-heading">
        <div>
          <div className="section-label">SCHEDULE & NOTIFICATIONS</div>
          <h2 id="alert-heading">Notice alerts</h2>
          <p>
            Receive verified updates at your preferred hour on working days. All change alerts are dispatched to your verified account email.
          </p>
        </div>
        <form onSubmit={saveAlerts}>
          <label className="toggle-control">
            <input
              type="checkbox"
              className="toggle-input"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="toggle-switch" />
            <span style={{ fontSize: '13px', fontWeight: 800 }}>
              {enabled ? 'Alerts active for this notice' : 'Enable alerts for this notice'}
            </span>
          </label>

          <label htmlFor="alert-hour">Delivery window (Working days Mon–Fri)</label>
          <select
            id="alert-hour"
            value={alertHour}
            onChange={(e) => setAlertHour(Number(e.target.value))}
            disabled={!enabled}
            style={{ marginBottom: '4px' }}
          >
            <option value={12}>12:00 PM (Noon)</option>
            <option value={13}>1:00 PM</option>
            <option value={14}>2:00 PM</option>
            <option value={15}>3:00 PM</option>
            <option value={16}>4:00 PM</option>
            <option value={17}>5:00 PM</option>
            <option value={18}>6:00 PM</option>
            <option value={19}>7:00 PM</option>
            <option value={20}>8:00 PM</option>
            <option value={21}>9:00 PM</option>
            <option value={22}>10:00 PM</option>
            <option value={23}>11:00 PM</option>
            <option value={0}>12:00 AM (Midnight)</option>
          </select>

          <div className="alert-destination-box">
            <span className="destination-label">DELIVER TO ACCOUNT EMAIL</span>
            <div className="destination-badge">
              <span className="destination-icon">✉</span>
              <span className="destination-email">{user?.email || topic.alertEmail || 'Your account email'}</span>
              <span className="verified-pill">VERIFIED</span>
            </div>
          </div>

          <button className="button button-primary" disabled={busy} type="submit" style={{ width: '100%', marginTop: '6px' }}>
            {busy ? 'Saving schedule…' : 'Save notification preferences'}
          </button>
          <small>
            {enabled ? 'Hourly cron checks for verified changes on weekdays.' : 'Alerts are turned off for this notice.'}
          </small>
        </form>
      </section>
      {results && <details className="snapshot-details"><summary>View latest sources</summary><div className="snapshot-columns"><div><h3>Search</h3>{results.search.map((item) => <SourceLink key={item.link} item={item} />)}</div><div><h3>News</h3>{results.news.map((item) => <SourceLink key={item.link} item={item} />)}</div></div></details>}
    </div>
  );
}

function getHostname(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

const SPAM_DOMAINS = ['play.google.com', 'amazon.in', 'facebook.com', 'instagram.com', 'imdb.com', 'context.reverso.net', 'buscalibre.com'];
const SPAM_TERMS = ['horoscope', 'astrology', 'rashi', 'gochar', 'panchang', 'shukra', 'kundali', 'अवघ्या', 'राशींचा', 'वाईट काळ'];
const GENERIC_WORDS = ['2024', '2025', '2026', '2027', 'case', 'update', 'notice', 'status', 'rule', 'form', 'date', 'dates', 'what', 'when', 'where', 'how', 'the', 'and', 'for', 'exam', 'scheme', 'other', 'general'];

function cleanSnippet(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[✓✔🚨►•]/g, ' ')
    .replace(/(\.{2,}|…)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s:;.-]+|[,\s:;.-]+$/g, '')
    .trim();
}

function cleanTitle(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[🚨►•]/g, ' ')
    .replace(/(\.{2,}|…)/g, '')
    .replace(/\s*[-|–]\s*(YouTube|Apps on Google Play|eBook|Wikipedia|Adda247|NDTV|The Hindu|The Indian Express|The Times of India|The Economic Times|PM India|Drishti IAS|Vajiram & Ravi).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSpam(item) {
  const host = getHostname(item?.link || '');
  if (SPAM_DOMAINS.some((d) => host.includes(d))) return true;
  const text = `${item?.title || ''} ${item?.snippet || ''}`.toLowerCase();
  if (SPAM_TERMS.some((term) => text.includes(term))) return true;
  return false;
}

function getLiveBriefing(results, topic) {
  if (!results) return null;

  // 1. Direct SerpApi Overview if stored
  if (results.overview?.text) {
    const bulletins = [];
    if (Array.isArray(results.news) && results.news.length > 0) {
      bulletins.push(...results.news.slice(0, 2).map((item) => ({
        type: 'NEWS BULLETIN',
        title: cleanTitle(item.title),
        link: item.link,
        source: item.source || 'News Source',
        date: item.date ? item.date.split(',')[0] : null,
      })));
    }
    if (Array.isArray(results.search) && results.search.length > 0) {
      const topSearch = results.search[0];
      bulletins.push({
        type: 'PRIMARY SOURCE',
        title: cleanTitle(topSearch.title),
        link: topSearch.link,
        source: getHostname(topSearch.link),
        date: topSearch.date || null,
        snippet: cleanSnippet(topSearch.snippet).slice(0, 90),
      });
    }
    return {
      tag: results.overview.label || 'SERPAPI INTELLIGENCE',
      coreStatus: results.overview.text,
      primarySource: results.overview.source ? { name: results.overview.source, link: results.overview.link } : null,
      keyPoints: [],
      bulletins: bulletins.slice(0, 3),
    };
  }

  // 2. Synthesize from Search & News with Spam & Relevance Filtering
  const rawSearch = Array.isArray(results.search) ? results.search : [];
  const rawNews = Array.isArray(results.news) ? results.news : [];
  if (!rawSearch.length && !rawNews.length) return null;

  const searchItems = rawSearch.filter((item) => !isSpam(item));
  const newsItems = rawNews.filter((item) => !isSpam(item));

  const topicWords = ((topic?.name || '') + ' ' + (topic?.category || ''))
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GENERIC_WORDS.includes(w));

  const isRelevant = (item) => {
    if (!topicWords.length) return true;
    const text = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
    return topicWords.some((w) => text.includes(w));
  };

  const relevantSearch = searchItems.filter(isRelevant);
  const relevantNews = newsItems.filter(isRelevant);

  let coreStatus = '';
  const bestSearch = relevantSearch.find((s) => cleanSnippet(s.snippet).length > 40);

  if (bestSearch) {
    const cleaned = cleanSnippet(bestSearch.snippet);
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 15);
    coreStatus = sentences.slice(0, 2).join(' ');
  } else if (relevantNews.length > 0) {
    const primarySource = relevantNews[0].source || 'National media';
    const topHeadline = cleanTitle(relevantNews[0].title);
    coreStatus = `Active coverage reported by ${primarySource}: “${topHeadline}”. Continuous monitoring enabled for updates.`;
  } else if (searchItems.length > 0) {
    const fallback = cleanSnippet(searchItems[0].snippet);
    coreStatus = fallback.length > 40 ? fallback.slice(0, 160) + '…' : `Tracking verified updates and official announcements for ${topic.name}.`;
  } else {
    coreStatus = `Real-time intelligence baseline recorded for ${topic.name}. Monitoring active search and news channels.`;
  }

  const keyPoints = [];
  for (const n of relevantNews.slice(0, 2)) {
    const title = cleanTitle(n.title);
    if (title) {
      keyPoints.push({
        badge: (n.source || 'MEDIA REPORT').toUpperCase(),
        text: title,
      });
    }
  }

  for (const s of (relevantSearch.length ? relevantSearch : (relevantNews.length ? [] : searchItems)).slice(0, 2)) {
    const title = cleanTitle(s.title);
    const snippet = cleanSnippet(s.snippet);
    if (keyPoints.length < 3 && (snippet || title) && !keyPoints.some((p) => p.text.includes(title))) {
      keyPoints.push({
        badge: getHostname(s.link).toUpperCase(),
        text: snippet.length > 30 ? (snippet.length > 120 ? snippet.slice(0, 120) + '…' : snippet) : title,
      });
    }
  }

  if (keyPoints.length < 3 && relevantNews[2]) {
    keyPoints.push({
      badge: (relevantNews[2].source || 'MEDIA REPORT').toUpperCase(),
      text: cleanTitle(relevantNews[2].title),
    });
  }

  const bulletins = [];
  const newsPool = relevantNews.length ? relevantNews : newsItems;

  for (const n of newsPool.slice(0, 2)) {
    bulletins.push({
      type: 'NEWS BULLETIN',
      title: cleanTitle(n.title),
      source: n.source || getHostname(n.link),
      date: n.date ? n.date.split(',')[0] : 'Recent',
      link: n.link,
    });
  }

  if (relevantSearch.length > 0) {
    bulletins.push({
      type: 'PRIMARY SOURCE',
      title: cleanTitle(relevantSearch[0].title),
      source: getHostname(relevantSearch[0].link),
      snippet: cleanSnippet(relevantSearch[0].snippet).slice(0, 90),
      link: relevantSearch[0].link,
    });
  } else if (newsPool[2]) {
    bulletins.push({
      type: 'NEWS BULLETIN',
      title: cleanTitle(newsPool[2].title),
      source: newsPool[2].source || getHostname(newsPool[2].link),
      date: newsPool[2].date ? newsPool[2].date.split(',')[0] : 'Recent',
      link: newsPool[2].link,
    });
  } else if (searchItems[0]) {
    bulletins.push({
      type: 'SEARCH RECORD',
      title: cleanTitle(searchItems[0].title),
      source: getHostname(searchItems[0].link),
      snippet: cleanSnippet(searchItems[0].snippet).slice(0, 90),
      link: searchItems[0].link,
    });
  }

  const primaryRecord = (relevantSearch[0] || (relevantNews.length ? relevantNews[0] : searchItems[0]));

  return {
    tag: relevantNews.length ? 'VERIFIED NEWS & NOTICE RADAR' : 'LIVE INTELLIGENCE BRIEFING',
    coreStatus,
    primarySource: primaryRecord ? { name: primaryRecord.source || getHostname(primaryRecord.link), link: primaryRecord.link } : null,
    keyPoints: keyPoints.slice(0, 3),
    bulletins: bulletins.slice(0, 3),
  };
}

function SourceLink({ item }) {
  try {
    const url = new URL(item.link);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return <a className="source-item" href={item.link} target="_blank" rel="noopener noreferrer"><strong>{item.title}</strong><span>{url.hostname.replace(/^www\./, '')} ↗</span></a>;
  } catch { return null; }
}
