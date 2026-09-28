import React, { useEffect, useState } from 'react';
import { createTopic, deleteTopic, listTopics } from '../api/client.js';
import TopicForm from '../components/TopicForm.jsx';
import TopicList from '../components/TopicList.jsx';
import TopicDetail from './TopicDetail.jsx';

export default function Dashboard() {
  const [topics, setTopics] = useState([]);
  const [selectedId, setSelectedId] = useState(new URLSearchParams(window.location.search).get('topic'));
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listTopics().then((items) => {
      if (!active) return;
      setTopics(items);
      setSelectedId((previous) => items.some((item) => item.id === previous) ? previous : items[0]?.id || null);
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set('topic', selectedId);
    else url.searchParams.delete('topic');
    window.history.replaceState(null, '', url);
  }, [selectedId]);

  useEffect(() => {
    const onPopState = () => setSelectedId(new URLSearchParams(window.location.search).get('topic'));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  async function add(fields) {
    const topic = await createTopic(fields);
    setTopics((items) => [topic, ...items]);
    setSelectedId(topic.id);
    setError('');
  }

  async function remove(topic) {
    if (!window.confirm(`Remove “${topic.name}” and its saved history?`)) return;
    try {
      await deleteTopic(topic.id);
      const remaining = topics.filter((item) => item.id !== topic.id);
      setTopics(remaining);
      setSelectedId(remaining[0]?.id || null);
      setError('');
    } catch (cause) { setError(cause.message); }
  }

  const selected = topics.find((topic) => topic.id === selectedId);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-symbol" aria-hidden="true">✳</span><span>notice<span className="brand-accent">me</span><small>WHAT CHANGED, MADE CLEAR.</small></span></div>
        <div className="sidebar-intro"><span className="live-dot" /> Monitoring public updates</div>
        <TopicList topics={topics} selectedId={selectedId} onSelect={setSelectedId} />
        <TopicForm onCreate={add} />
        <div className="sidebar-foot">Powered by live Search + News<br />Checked every three hours</div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><span>MONITORING DASHBOARD</span><button type="button" className="button button-quiet" onClick={() => setRevision((value) => value + 1)}>↻ Refresh</button></header>
        {error && <p className="form-error page-error" role="alert">{error}</p>}
        {loading ? <div className="empty-page">Loading watchlist…</div> : selected ? <TopicDetail key={selected.id} topic={selected} onDelete={remove} onAlertChange={(updated) => setTopics((items) => items.map((item) => item.id === updated.id ? updated : item))} refreshToken={revision} /> : (
          <div className="empty-page"><span aria-hidden="true">✳</span><h1>Your watchlist starts here</h1><p>Add a topic on the left. Notice Me will collect live sources and show changes over time.</p></div>
        )}
      </main>
    </div>
  );
}
