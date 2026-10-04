import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getLatestSnapshot, getTimeline, updateAlertSettings, syncTopic } from '../api/client.js';
import TimelineView from '../components/TimelineView.jsx';
import DossierModal from '../components/DossierModal.jsx';
import {
  IconFileText,
  IconRefresh,
  IconTrash,
  IconExternalLink,
  IconClock,
  IconAlertTriangle,
  IconShield,
  IconBell,
} from '../components/Icons.jsx';

const STANDARD_FREQS = ['1d', '2d', '3d', '5d', '7d', '14d', '30d'];

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function isMonthlyCadence(freq, isCustom = false) {
  if (isCustom) return false;
  const str = String(freq || '').toLowerCase().trim();
  return str === '30d' || str === 'monthly' || str === '1m';
}

function getFrequencyLabel(freq) {
  if (!freq) return 'daily';
  const str = String(freq).toLowerCase();
  if (str === '1d' || str === 'daily') return 'daily';
  if (str === '2d') return 'every 2 days';
  if (str === '3d') return 'every 3 days';
  if (str === '5d') return 'every 5 days';
  if (str === '7d' || str === 'weekly' || str === '1w') return 'weekly';
  if (str === '14d' || str === 'biweekly' || str === '2w') return 'bi-weekly';
  if (str === '30d' || str === 'monthly' || str === '1m') return 'monthly';
  const match = str.match(/^(\d+)d?$/);
  if (match) return `every ${match[1]} days`;
  return `every ${freq}`;
}

export default function TopicDetail({ topic, onDelete, onAlertChange, refreshToken }) {
  const { user } = useAuth();
  const [diffs, setDiffs] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [enabled, setEnabled] = useState(Boolean(topic.alertEnabled));
  const [frequency, setFrequency] = useState(topic.alertFrequency || '1d');
  const [isCustomFreq, setIsCustomFreq] = useState(!STANDARD_FREQS.includes(topic.alertFrequency || '1d'));
  const [customDays, setCustomDays] = useState(() => {
    const match = String(topic.alertFrequency || '').match(/^(\d+)d?$/);
    return match ? parseInt(match[1], 10) : 10;
  });
  const [alertHour, setAlertHour] = useState(topic.alertHour ?? 12);
  const [alertDays, setAlertDays] = useState(() => {
    const freq = topic.alertFrequency || '1d';
    const isCustom = !STANDARD_FREQS.includes(freq);
    if (isMonthlyCadence(freq, isCustom)) {
      return /^(?:[1-9]|[12][0-9]|30)$/.test(String(topic.alertDays || '').trim())
        ? String(topic.alertDays).trim()
        : '1';
    }
    return topic.alertDays || 'weekdays';
  });
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showDossier, setShowDossier] = useState(() => new URL(window.location.href).searchParams.get('dossier') === 'open');

  useEffect(() => {
    setEnabled(Boolean(topic.alertEnabled));
    const freq = topic.alertFrequency || '1d';
    setFrequency(freq);
    const custom = !STANDARD_FREQS.includes(freq);
    setIsCustomFreq(custom);
    if (custom) {
      const match = String(freq).match(/^(\d+)d?$/);
      if (match) setCustomDays(parseInt(match[1], 10));
    }
    setAlertHour(topic.alertHour ?? 12);
    if (isMonthlyCadence(freq, custom)) {
      setAlertDays(/^(?:[1-9]|[12][0-9]|30)$/.test(String(topic.alertDays || '').trim())
        ? String(topic.alertDays).trim()
        : '1');
    } else {
      setAlertDays(topic.alertDays || 'weekdays');
    }
  }, [topic.alertEnabled, topic.alertFrequency, topic.alertHour, topic.alertDays]);
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

  function handleFrequencyChange(newFreqVal) {
    if (newFreqVal === 'custom') {
      setIsCustomFreq(true);
      setFrequency(`${customDays}d`);
      if (/^(?:[1-9]|[12][0-9]|30)$/.test(String(alertDays).trim())) {
        setAlertDays('weekdays');
      }
    } else {
      setIsCustomFreq(false);
      setFrequency(newFreqVal);
      if (isMonthlyCadence(newFreqVal, false)) {
        if (!/^(?:[1-9]|[12][0-9]|30)$/.test(String(alertDays).trim())) {
          setAlertDays('1');
        }
      } else {
        if (/^(?:[1-9]|[12][0-9]|30)$/.test(String(alertDays).trim())) {
          setAlertDays('weekdays');
        }
      }
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
        alertDays,
      });
      onAlertChange(updated);
      const hourLabel = alertHour === 12 ? '12:00 PM' : alertHour === 0 ? '12:00 AM' : alertHour > 12 ? `${alertHour - 12}:00 PM` : `${alertHour}:00 AM`;
      let cadenceDesc;
      if (isMonthlyCadence(frequency, isCustomFreq)) {
        const d = /^(?:[1-9]|[12][0-9]|30)$/.test(String(alertDays).trim()) ? Number(alertDays) : 1;
        cadenceDesc = `monthly on the ${getOrdinal(d)} of every month${d >= 28 ? ' (Feb 28 in Feb)' : ''}`;
      } else {
        const freqLabel = getFrequencyLabel(frequency);
        const dayLabel = alertDays === 'weekdays' ? 'on working days (Mon–Fri)' : alertDays === 'all' ? 'every day' : `every ${alertDays.toUpperCase()}`;
        cadenceDesc = `${freqLabel} ${dayLabel}`;
      }
      setMessage(updated.alertEnabled ? `Alerts scheduled ${cadenceDesc} at ${hourLabel}.` : 'Alerts disabled.');
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
            className="button button-quiet export-dossier-button"
            onClick={() => setShowDossier(true)}
            disabled={!briefing || syncing}
            title="Export full executive intelligence dossier as PDF, Markdown, or share link"
          >
            <IconFileText size={15} />
            <span>Export Dossier</span>
          </button>
          <button
            type="button"
            className={`button button-sync ${syncing ? 'is-syncing' : ''}`}
            onClick={handleSync}
            disabled={syncing || busy}
            title="Fetch latest Google Search & News results now"
          >
            <IconRefresh size={15} className={syncing ? 'spin-icon' : ''} />
            <span>{syncing ? 'Syncing…' : 'Sync Live Data'}</span>
          </button>
          <button type="button" className="button button-danger delete-button" onClick={() => onDelete(topic)}>
            <IconTrash size={15} />
            <span>Remove notice</span>
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
        <div className="metric metric-volatility">
          <span>VOLATILITY RADAR</span>
          <strong className={`metric-volatility-val val-${(briefing?.urgency || 'routine').toLowerCase()}`}>
            {briefing?.volatilityScore ?? 25}
            <small>/100</small>
            <span className={`volatility-pill pill-${(briefing?.urgency || 'routine').toLowerCase()}`}>
              {briefing?.urgency || 'STABLE'}
            </span>
          </strong>
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

          <div className="briefing-radar-strip">
            <div className="radar-strip-left">
              <span className={`radar-urgency-badge urgency-${(briefing.urgency || 'routine').toLowerCase()}`}>
                <span className="live-dot" style={{ width: '6px', height: '6px' }} />
                <span>{briefing.urgency || 'ROUTINE'} ACTION REQUIRED</span>
              </span>
              <span className="radar-strip-meta">
                Volatility Index: <strong>{briefing.volatilityScore ?? 35}</strong>/100
              </span>
            </div>
            <div className="radar-track-bar">
              <div
                className={`radar-fill-bar fill-${(briefing.urgency || 'routine').toLowerCase()}`}
                style={{ width: `${briefing.volatilityScore ?? 35}%` }}
              />
            </div>
          </div>

          <div className="briefing-summary-box">
            <div className="briefing-box-label">
              <IconShield size={14} className="summary-icon" />
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
                <span>Primary Source: <strong>{briefing.primarySource.name}</strong></span>
                <IconExternalLink size={13} />
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

          {Array.isArray(briefing.deadlines) && briefing.deadlines.length > 0 && (
            <div className="briefing-deadlines-box">
              <div className="briefing-box-label">
                <IconClock size={14} className="summary-icon" />
                <span>DETECTED DEADLINES &amp; KEY DATES</span>
              </div>
              <div className="deadlines-grid">
                {briefing.deadlines.map((dl, idx) => (
                  <div key={idx} className="deadline-item">
                    <span className={`deadline-urgency urgency-${(dl.urgency || 'medium').toLowerCase()}`}>
                      {dl.urgency || 'KEY DATE'}
                    </span>
                    <strong className="deadline-title">{dl.title}</strong>
                    <span className="deadline-date">{dl.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {briefing.actionRequired && (
            <div className="briefing-action-box">
              <div className="briefing-box-label">
                <IconAlertTriangle size={14} className="summary-icon" />
                <span>RECOMMENDED ACTION FOR YOU</span>
              </div>
              <p className="briefing-action-text">{briefing.actionRequired}</p>
            </div>
          )}

          {briefing.bulletins.length > 0 && (
            <div className="briefing-bulletins">
              <div className="bulletins-header">
                <span>ACTIVE MEDIA RADAR &amp; TOP BULLETINS</span>
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
                      <IconExternalLink size={12} className="bulletin-arrow" />
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
                : 'Initial baseline has not been recorded yet. Click “Sync Live Data” above to fetch real-time intelligence immediately.'}
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

          <div className="schedule-controls-grid">
            <div className="schedule-control-field">
              <label htmlFor="alert-frequency">Frequency</label>
              <select
                id="alert-frequency"
                value={isCustomFreq ? 'custom' : frequency}
                onChange={(e) => handleFrequencyChange(e.target.value)}
                disabled={!enabled}
              >
                <option value="1d">Daily (Every day)</option>
                <option value="2d">Every 2 days</option>
                <option value="3d">Every 3 days</option>
                <option value="5d">Every 5 days</option>
                <option value="7d">Weekly (Every 7 days)</option>
                <option value="14d">Bi-weekly (Every 2 weeks)</option>
                <option value="30d">Monthly (Choose date)</option>
                <option value="custom">Custom interval…</option>
              </select>
            </div>

            {isCustomFreq && (
              <div className="schedule-control-field">
                <label htmlFor="custom-days">Days Interval</label>
                <input
                  id="custom-days"
                  type="number"
                  min="1"
                  max="365"
                  value={customDays}
                  onChange={(e) => {
                    const days = Math.max(1, parseInt(e.target.value, 10) || 1);
                    setCustomDays(days);
                    setFrequency(`${days}d`);
                  }}
                  disabled={!enabled}
                />
              </div>
            )}

            {isMonthlyCadence(frequency, isCustomFreq) ? (
              <div className="schedule-control-field">
                <label htmlFor="alert-date">On Date of Month</label>
                <select
                  id="alert-date"
                  value={alertDays}
                  onChange={(e) => setAlertDays(e.target.value)}
                  disabled={!enabled}
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((date) => (
                    <option key={date} value={String(date)}>
                      {getOrdinal(date)} of every month{date >= 28 ? ' (Feb 28 in Feb)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="schedule-control-field">
                <label htmlFor="alert-days">On Day(s)</label>
                <select
                  id="alert-days"
                  value={alertDays}
                  onChange={(e) => setAlertDays(e.target.value)}
                  disabled={!enabled}
                >
                  <option value="weekdays">Working days (Mon–Fri)</option>
                  <option value="all">Every day (Mon–Sun)</option>
                  <option value="mon">Every Monday</option>
                  <option value="tue">Every Tuesday</option>
                  <option value="wed">Every Wednesday</option>
                  <option value="thu">Every Thursday</option>
                  <option value="fri">Every Friday</option>
                  <option value="sat">Every Saturday</option>
                  <option value="sun">Every Sunday</option>
                </select>
              </div>
            )}

            <div className="schedule-control-field">
              <label htmlFor="alert-hour">Delivery Time</label>
              <select
                id="alert-hour"
                value={alertHour}
                onChange={(e) => setAlertHour(Number(e.target.value))}
                disabled={!enabled}
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
            </div>
          </div>

          <div className="alert-destination-box">
            <span className="destination-label">DELIVER TO ACCOUNT EMAIL</span>
            <div className="destination-badge">
              <span className="destination-email">{user?.email || topic.alertEmail || 'Your account email'}</span>
              <span className="verified-pill">VERIFIED</span>
            </div>
          </div>

          <button className="button button-primary" disabled={busy} type="submit" style={{ width: '100%', marginTop: '6px' }}>
            {busy ? 'Saving schedule…' : 'Save notification preferences'}
          </button>
          <small style={{ display: 'block', marginTop: '8px', color: 'var(--text-muted)' }}>
            {enabled
              ? `Scheduled updates delivered ${
                  isMonthlyCadence(frequency, isCustomFreq)
                    ? `monthly on the ${getOrdinal(/^(?:[1-9]|[12][0-9]|30)$/.test(String(alertDays).trim()) ? Number(alertDays) : 1)} of every month${Number(alertDays) >= 28 ? ' (Feb 28 in Feb)' : ''}`
                    : `${getFrequencyLabel(frequency)} ${alertDays === 'weekdays' ? 'on working days' : alertDays === 'all' ? 'every day' : `on ${alertDays.toUpperCase()}s`}`
                } at ${alertHour === 12 ? '12:00 PM' : alertHour === 0 ? '12:00 AM' : alertHour > 12 ? `${alertHour - 12}:00 PM` : `${alertHour}:00 AM`}.`
              : 'Alerts are turned off for this notice.'}
          </small>
        </form>
      </section>
      {results && <details className="snapshot-details"><summary>View latest sources</summary><div className="snapshot-columns"><div><h3>Search</h3>{results.search.map((item) => <SourceLink key={item.link} item={item} />)}</div><div><h3>News</h3>{results.news.map((item) => <SourceLink key={item.link} item={item} />)}</div></div></details>}

      {showDossier && (
        <DossierModal
          topic={topic}
          briefing={briefing}
          diffs={diffs}
          onClose={() => {
            setShowDossier(false);
            const url = new URL(window.location.href);
            url.searchParams.delete('dossier');
            window.history.replaceState(null, '', url);
          }}
        />
      )}
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

  // 1. Gemini AI Briefing if generated
  if (results.aiBriefing?.coreStatus) {
    const rawSearch = Array.isArray(results.search) ? results.search : [];
    const rawNews = Array.isArray(results.news) ? results.news : [];
    const bulletins = [];
    for (const n of rawNews.slice(0, 2)) {
      bulletins.push({
        type: 'NEWS BULLETIN',
        title: cleanTitle(n.title),
        link: n.link,
        source: n.source || getHostname(n.link),
        date: n.date ? n.date.split(',')[0] : 'Recent',
      });
    }
    if (rawSearch[0]) {
      bulletins.push({
        type: 'PRIMARY SOURCE',
        title: cleanTitle(rawSearch[0].title),
        link: rawSearch[0].link,
        source: getHostname(rawSearch[0].link),
        date: rawSearch[0].date || null,
        snippet: cleanSnippet(rawSearch[0].snippet).slice(0, 90),
      });
    }
    const primaryRecord = rawSearch[0] || rawNews[0];
    let urgency = results.aiBriefing.urgency;
    if (!urgency) {
      const hasHighDeadline = Array.isArray(results.aiBriefing.deadlines) &&
        results.aiBriefing.deadlines.some((d) => String(d.urgency).toUpperCase() === 'HIGH');
      urgency = hasHighDeadline ? 'CRITICAL' : 'MODERATE';
    }
    const volatilityScore = typeof results.aiBriefing.volatilityScore === 'number'
      ? results.aiBriefing.volatilityScore
      : (urgency === 'CRITICAL' ? 88 : urgency === 'MODERATE' ? 58 : 28);

    return {
      tag: 'GEMINI AI VERIFIED BRIEFING',
      coreStatus: results.aiBriefing.coreStatus,
      urgency,
      volatilityScore,
      primarySource: primaryRecord ? { name: primaryRecord.source || getHostname(primaryRecord.link), link: primaryRecord.link } : null,
      keyPoints: Array.isArray(results.aiBriefing.keyPoints) ? results.aiBriefing.keyPoints : [],
      deadlines: Array.isArray(results.aiBriefing.deadlines) ? results.aiBriefing.deadlines : [],
      actionRequired: results.aiBriefing.actionRequired || null,
      bulletins: bulletins.slice(0, 3),
    };
  }

  // 2. Direct SerpApi Overview if stored
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
      urgency: 'MODERATE',
      volatilityScore: 50,
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
  const combinedText = `${coreStatus} ${searchItems.map((s) => s.title + ' ' + s.snippet).join(' ')} ${newsItems.map((n) => n.title).join(' ')}`.toLowerCase();
  const isCritical = /deadline|last date|postpon|cancel|stay order|cutoff|hall ticket|admit card|urgent|scheduled|verdict/i.test(combinedText);
  const isModerate = /admit|apply|admissions|registration|scheme|policy|eligibility|result|release|announcement/i.test(combinedText);

  const urgency = isCritical ? 'CRITICAL' : (isModerate ? 'MODERATE' : 'ROUTINE');
  const volatilityScore = isCritical ? 84 : (isModerate ? 55 : 24);

  return {
    tag: relevantNews.length ? 'VERIFIED NEWS & NOTICE RADAR' : 'LIVE INTELLIGENCE BRIEFING',
    coreStatus,
    urgency,
    volatilityScore,
    primarySource: primaryRecord ? { name: primaryRecord.source || getHostname(primaryRecord.link), link: primaryRecord.link } : null,
    keyPoints: keyPoints.slice(0, 3),
    bulletins: bulletins.slice(0, 3),
  };
}

function SourceLink({ item }) {
  try {
    const url = new URL(item.link);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return (
      <a className="source-item" href={item.link} target="_blank" rel="noopener noreferrer">
        <strong>{item.title}</strong>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {url.hostname.replace(/^www\./, '')}
          <IconExternalLink size={12} />
        </span>
      </a>
    );
  } catch { return null; }
}
