import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createTopic, deleteTopic, listTopics, searchTopics, getTrendingTopics } from '../api/client.js';
import { findTopicBySlugOrId, getTopicSlug } from '../utils/slug.js';
import TopicForm from '../components/TopicForm.jsx';
import TopicList from '../components/TopicList.jsx';
import DiffCard from '../components/DiffCard.jsx';
import Logo from '../components/Logo.jsx';
import TopicDetail from './TopicDetail.jsx';
import TrendingFeed from '../components/TrendingFeed.jsx';

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const [topics, setTopics] = useState([]);
  const [trending, setTrending] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('watchlist'); // 'watchlist' | 'trending'
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listTopics(), getTrendingTopics().catch(() => [])]).then(([items, trends]) => {
      if (!active) return;
      setTopics(items);
      setTrending(trends || []);
      const param = new URLSearchParams(window.location.search).get('topic');
      const viewParam = new URLSearchParams(window.location.search).get('view');
      if (viewParam === 'trending' || (!param && items.length === 0)) {
        setViewMode('trending');
        setSelectedId(null);
      } else {
        const matched = findTopicBySlugOrId(param, items) || items[0] || null;
        setSelectedId(matched?.id || null);
        if (matched) setViewMode('watchlist');
        else if (items.length === 0) setViewMode('trending');
      }
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (viewMode === 'trending') {
      url.searchParams.set('view', 'trending');
      url.searchParams.delete('topic');
    } else {
      url.searchParams.delete('view');
      const current = topics.find((t) => t.id === selectedId);
      if (current) {
        url.searchParams.set('topic', getTopicSlug(current, topics));
      } else {
        url.searchParams.delete('topic');
      }
    }
    window.history.replaceState(null, '', url);
  }, [selectedId, topics, viewMode]);

  useEffect(() => {
    const onPopState = () => {
      const param = new URLSearchParams(window.location.search).get('topic');
      const matched = findTopicBySlugOrId(param, topics);
      if (matched) setSelectedId(matched.id);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [topics]);

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
    setViewMode('watchlist');
    setError('');
  }

  async function remove(topic) {
    if (!window.confirm(`Remove “${topic.name}” and its saved history?`)) return;
    try {
      await deleteTopic(topic.id);
      const remaining = topics.filter((item) => item.id !== topic.id);
      setTopics(remaining);
      setSelectedId(remaining[0]?.id || null);
      if (remaining.length === 0) setViewMode('trending');
      setError('');
    } catch (cause) { setError(cause.message); }
  }

  const selected = topics.find((topic) => topic.id === selectedId);
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation menu"
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-mobile-header">
          <div className="brand" style={{ padding: '0 4px' }}>
            <Logo />
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>
        <div className="sidebar-intro"><span className="live-dot" /> Live SerpApi monitoring</div>
        <div className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-tab ${viewMode === 'watchlist' ? 'is-active' : ''}`}
            onClick={() => {
              setViewMode('watchlist');
              if (!selectedId && topics.length > 0) setSelectedId(topics[0].id);
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-label">
              <span className="sidebar-nav-icon">📑</span>
              <span>My Watchlist</span>
            </div>
            <span className="sidebar-nav-count">{topics.length}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-tab ${viewMode === 'trending' ? 'is-active' : ''}`}
            onClick={() => {
              setViewMode('trending');
              setSelectedId(null);
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-label">
              <span className="sidebar-nav-icon">🔥</span>
              <span>Trending Radar</span>
            </div>
            <span className="sidebar-nav-badge">HOT</span>
          </button>
        </div>
        <TopicList
          topics={topics}
          selectedId={viewMode === 'watchlist' ? selectedId : null}
          onSelect={(id) => {
            setSelectedId(id);
            setViewMode('watchlist');
            setSidebarOpen(false);
          }}
        />
        <TopicForm onCreate={async (fields) => {
          await add(fields);
          setSidebarOpen(false);
        }} />
        <div className="sidebar-foot">Live Google Search + News<br />Hourly schedule active</div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle navigation drawer"
              title="Toggle navigation"
            >
              ☰
            </button>
            <span className="topbar-badge">NOTICE BOARD</span>
            <span className="topbar-divider">/</span>
            <span className="topbar-active-view">
              {viewMode === 'trending' ? '🔥 Trending Radar' : (selected ? selected.name : 'Watchlist Overview')}
            </span>
          </div>
          <div className="topbar-search">
            <span className="topbar-search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              placeholder="Search topics, circulars, diffs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
              aria-label="Search topics and circulars"
            />
            {query ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery('')}
                title="Clear search"
                aria-label="Clear search"
              >
                ✕
              </button>
            ) : (
              <span className="search-kbd-hint">ESC</span>
            )}
          </div>
          <div className="topbar-right">
            <div className="user-profile-badge" title={user?.email}>
              <span className="user-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</span>
              <span className="user-email-text">{user?.email}</span>
            </div>
            <button type="button" className="button button-quiet topbar-btn" onClick={() => setRevision((value) => value + 1)} title="Refresh data">↻ Refresh</button>
            <button type="button" className="button button-quiet topbar-btn" onClick={signOut} title="Sign out">Sign out</button>
          </div>
        </header>
        {error && <p className="form-error page-error" role="alert">{error}</p>}
        {query.trim().length >= 2 ? (
          <div className="search-results-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div className="section-label">SEARCH RESULTS</div>
                <h2 style={{ margin: '4px 0 0' }}>Results for “{query.trim()}”</h2>
              </div>
              <button type="button" className="button button-quiet" onClick={() => setQuery('')}>
                ✕ Close Search
              </button>
            </div>
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
        ) : viewMode === 'trending' ? (
          <TrendingFeed
            trending={trending}
            userTopics={topics}
            onTrack={add}
            onSelectExisting={(id) => { setSelectedId(id); setViewMode('watchlist'); }}
          />
        ) : selected ? (
          <TopicDetail
            key={selected.id}
            topic={selected}
            onDelete={remove}
            onAlertChange={(updated) => setTopics((items) => items.map((item) => item.id === updated.id ? updated : item))}
            refreshToken={revision}
          />
        ) : (
          <TrendingFeed
            trending={trending}
            userTopics={topics}
            onTrack={add}
            onSelectExisting={(id) => { setSelectedId(id); setViewMode('watchlist'); }}
          />
        )}
      </main>
    </div>
  );
}
