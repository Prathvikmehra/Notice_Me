import React, { useEffect, useState } from 'react';
import { getLatestSnapshot, getTimeline, updateAlertSettings } from '../api/client.js';
import TimelineView from '../components/TimelineView.jsx';

export default function TopicDetail({ topic, onDelete, onAlertChange, refreshToken }) {
  const [diffs, setDiffs] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [email, setEmail] = useState(topic.alertEmail || '');
  const [enabled, setEnabled] = useState(Boolean(topic.alertEnabled));
  const [frequency, setFrequency] = useState(topic.alertFrequency || '3h');
  const [alertHour, setAlertHour] = useState(topic.alertHour ?? 12);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEmail(topic.alertEmail || '');
    setEnabled(Boolean(topic.alertEnabled));
    setFrequency(topic.alertFrequency || '3h');
    setAlertHour(topic.alertHour ?? 12);
  }, [topic.alertEmail, topic.alertEnabled, topic.alertFrequency, topic.alertHour]);
  useEffect(() => { setMessage(''); }, [topic.id]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([getTimeline(topic.id), getLatestSnapshot(topic.id)]).then(([timeline, latest]) => {
      if (active) { setDiffs(timeline.diffs); setSnapshot(latest.snapshot); }
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [topic.id, refreshToken]);

  async function saveAlerts(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateAlertSettings(topic.id, {
        email: email.trim() || null,
        alertEnabled: enabled,
        alertFrequency: frequency,
        alertHour: enabled ? Number(alertHour) : null,
        alertDays: 'weekdays',
      });
      onAlertChange(updated);
      const hourLabel = alertHour === 12 ? '12 PM' : alertHour === 0 ? '12 AM' : alertHour > 12 ? `${alertHour - 12} PM` : `${alertHour} AM`;
      setMessage(updated.alertEnabled ? `Alerts enabled at ${hourLabel} on weekdays.` : 'Alerts disabled.');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  const results = snapshot?.rawData;
  const lastPull = snapshot?.pulledAt && new Date(snapshot.pulledAt);
  return (
    <div className="detail">
      <div className="detail-header">
        <div><div className="eyebrow">TRACKED TOPIC / {topic.category || 'GENERAL'}</div><h1>{topic.name}</h1><p className="query">{topic.query}</p></div>
        <button type="button" className="button button-quiet delete-button" onClick={() => onDelete(topic)}>Remove topic</button>
      </div>
      <div className="metric-grid">
        <div className="metric"><span>LAST CHECKED</span><strong>{lastPull && !Number.isNaN(lastPull.getTime()) ? lastPull.toLocaleString() : 'Awaiting first pull'}</strong></div>
        <div className="metric"><span>SEARCH SOURCES</span><strong>{results?.search?.length ?? '—'}</strong></div>
        <div className="metric"><span>NEWS SOURCES</span><strong>{results?.news?.length ?? '—'}</strong></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      <TimelineView diffs={diffs} loading={loading} />
      <section className="settings-card" aria-labelledby="alert-heading">
        <div>
          <div className="section-label">NOTIFICATIONS</div>
          <h2 id="alert-heading">Change alerts</h2>
          <p>Control whether and how often you receive email alerts when changes are detected.</p>
        </div>
        <form onSubmit={saveAlerts}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: 'auto', minHeight: 'auto' }}
            />
            <span>Enable alerts for this topic</span>
          </label>

          <label htmlFor="alert-hour">Delivery time (Working days Mon–Fri only)</label>
          <select
            id="alert-hour"
            value={alertHour}
            onChange={(e) => setAlertHour(Number(e.target.value))}
            disabled={!enabled}
            style={{ marginBottom: '8px' }}
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

          <label htmlFor="alert-email">Alert email recipient</label>
          <div className="input-action">
            <input
              id="alert-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={!enabled}
              required={enabled}
            />
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
          <small>{enabled ? 'Email required when alerts are enabled.' : 'Alerts currently disabled.'}</small>
        </form>
      </section>
      {results && <details className="snapshot-details"><summary>View latest sources</summary><div className="snapshot-columns"><div><h3>Search</h3>{results.search.map((item) => <SourceLink key={item.link} item={item} />)}</div><div><h3>News</h3>{results.news.map((item) => <SourceLink key={item.link} item={item} />)}</div></div></details>}
    </div>
  );
}

function SourceLink({ item }) {
  try {
    const url = new URL(item.link);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return <a className="source-item" href={item.link} target="_blank" rel="noopener noreferrer"><strong>{item.title}</strong><span>{url.hostname.replace(/^www\./, '')} ↗</span></a>;
  } catch { return null; }
}
