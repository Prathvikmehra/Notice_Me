import React, { useEffect, useState } from 'react';
import { getLatestSnapshot, getTimeline, setAlertEmail } from '../api/client.js';
import TimelineView from '../components/TimelineView.jsx';

export default function TopicDetail({ topic, onDelete, onAlertChange, refreshToken }) {
  const [diffs, setDiffs] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [email, setEmail] = useState(topic.alertEmail || '');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { setEmail(topic.alertEmail || ''); }, [topic.alertEmail]);
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

  async function saveEmail(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await setAlertEmail(topic.id, email.trim() || null);
      onAlertChange(updated);
      setMessage(updated.alertEmail ? 'Email alerts saved.' : 'Email alerts disabled.');
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
        <div><div className="section-label">STAY IN THE LOOP</div><h2 id="alert-heading">Email alerts</h2><p>Get notified when a new change is detected. Mail delivery requires SMTP to be configured.</p></div>
        <form onSubmit={saveEmail}><label htmlFor="alert-email">Alert email</label><div className="input-action"><input id="alert-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="button button-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save'}</button></div><small>Leave blank and save to turn alerts off.</small></form>
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
