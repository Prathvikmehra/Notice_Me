import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createTopic, deleteTopic, listTopics, searchTopics } from '../api/client.js';
import TopicForm from '../components/TopicForm.jsx';
import TopicList from '../components/TopicList.jsx';
import DiffCard from '../components/DiffCard.jsx';
import Logo from '../components/Logo.jsx';
import TopicDetail from './TopicDetail.jsx';

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const [topics, setTopics] = useState([]);
  const [selectedId, setSelectedId] = useState(new URLSearchParams(window.location.search).get('topic'));
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

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

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchTopics(trimmed)
        .then((res) => { setSearchResults(res); })
        .catch((err) => { setError(err.message); })
        .finally(() => { setSearching(false); });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

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
        <div className="brand" style={{ padding: '0 4px' }}>
          <Logo />
        </div>
        <div className="sidebar-intro"><span className="live-dot" /> Live SerpApi monitoring</div>
        <TopicList topics={topics} selectedId={selectedId} onSelect={setSelectedId} />
        <TopicForm onCreate={add} />
        <div className="sidebar-foot">Live Google Search + News<br />Hourly schedule active</div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <span className="topbar-title">Notice Board</span>
          <div className="topbar-search">
            <input
              type="search"
              placeholder="Search topics & diffs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <div className="user-profile-badge">
              <span className="user-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</span>
              <span>{user?.email}</span>
            </div>
            <button type="button" className="button button-quiet" onClick={() => setRevision((value) => value + 1)}>↻ Refresh</button>
            <button type="button" className="button button-quiet" onClick={signOut}>Sign out</button>
          </div>
        </header>
        {error && <p className="form-error page-error" role="alert">{error}</p>}
        {query.trim().length >= 2 ? (
          <div className="search-results-panel">
            <div className="section-label" style={{ marginBottom: '8px' }}>SEARCH RESULTS</div>
            <h2>Results for “{query.trim()}”</h2>
            {searching ? (
              <div className="empty-state" style={{ marginTop: '20px' }}>Searching topics & update history…</div>
            ) : (!searchResults?.topics?.length && !searchResults?.diffs?.length) ? (
              <div className="empty-state" style={{ marginTop: '20px' }}>
                <span aria-hidden="true">🔍</span>
                <h3>No matches found</h3>
                <p>No topics or update summaries matched your query.</p>
              </div>
            ) : (
              <>
                {Boolean(searchResults?.topics?.length) && (
                  <section className="search-section">
                    <h3><span>Matched Topics</span><small>{searchResults.topics.length}</small></h3>
                    <div className="search-topic-grid">
                      {searchResults.topics.map((t) => (
                        <div
                          key={t.id}
                          className="search-topic-card"
                          onClick={() => { setSelectedId(t.id); setQuery(''); }}
                        >
                          <strong>{t.name}</strong>
                          <small>{t.query}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {Boolean(searchResults?.diffs?.length) && (
                  <section className="search-section">
                    <h3><span>Matched Updates</span><small>{searchResults.diffs.length}</small></h3>
                    <div>
                      {searchResults.diffs.map((d) => (
                        <div key={d.id} style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#25503e', marginBottom: '4px' }}>
                            Topic: {d.topic?.name || 'Unknown'}
                          </div>
                          <DiffCard change={d} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        ) : loading ? (
          <div className="empty-page">Loading watchlist…</div>
        ) : selected ? (
          <TopicDetail
            key={selected.id}
            topic={selected}
            onDelete={remove}
            onAlertChange={(updated) => setTopics((items) => items.map((item) => item.id === updated.id ? updated : item))}
            refreshToken={revision}
          />
        ) : (
          <div className="empty-page">
            <span aria-hidden="true">§</span>
            <h1>No notice selected</h1>
            <p>Select a tracked item from your watchlist on the left, or add a new public scheme, exam, or policy to monitor live changes.</p>
          </div>
        )}
      </main>
    </div>
  );
}
