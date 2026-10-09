import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createTopic, deleteTopic, listTopics, searchTopics, getTrendingTopics, upgradePlan, getProfile } from '../api/client.js';
import { findTopicBySlugOrId, getTopicSlug } from '../utils/slug.js';
import TopicForm from '../components/TopicForm.jsx';
import TopicList from '../components/TopicList.jsx';
import DiffCard from '../components/DiffCard.jsx';
import Logo from '../components/Logo.jsx';
import TopicDetail from './TopicDetail.jsx';
import TrendingFeed from '../components/TrendingFeed.jsx';
import RecentChangesFeed from '../components/RecentChangesFeed.jsx';

const AIChatModal = React.lazy(() => import('../components/AIChatModal.jsx'));
const ProModal = React.lazy(() => import('../components/ProModal.jsx'));
const ProfileModal = React.lazy(() => import('../components/ProfileModal.jsx'));
import {
  IconZap,
  IconFileText,
  IconRadio,
  IconSearch,
  IconX,
  IconMenu,
  IconSparkles,
  IconRefresh,
  IconLogOut,
  IconUser,
} from '../components/Icons.jsx';

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const searchInputRef = useRef(null);
  const [topics, setTopics] = useState([]);
  const [trending, setTrending] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('activity'); // 'activity' | 'watchlist' | 'trending'
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [refreshingTrending, setRefreshingTrending] = useState(false);

  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleRefreshTrending = async (force = false) => {
    setRefreshingTrending(true);
    try {
      const live = await getTrendingTopics(force);
      setTrending(live || []);
    } catch {
      // keep current
    } finally {
      setRefreshingTrending(false);
    }
  };

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
      } else if (param) {
        const matched = findTopicBySlugOrId(param, items) || items[0] || null;
        setSelectedId(matched?.id || null);
        setViewMode('watchlist');
      } else if (viewParam === 'watchlist') {
        setSelectedId(items[0]?.id || null);
        setViewMode('watchlist');
      } else {
        // Default to What Changed activity digest feed
        setViewMode('activity');
        setSelectedId(items[0]?.id || null);
      }
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    if (loading) return;
    const url = new URL(window.location.href);
    if (viewMode === 'trending') {
      url.searchParams.set('view', 'trending');
      url.searchParams.delete('topic');
    } else if (viewMode === 'activity') {
      url.searchParams.set('view', 'activity');
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
  }, [selectedId, topics, viewMode, loading]);

  useEffect(() => {
    const onPopState = () => {
      const param = new URLSearchParams(window.location.search).get('topic');
      const viewParam = new URLSearchParams(window.location.search).get('view');
      if (viewParam === 'activity') {
        setViewMode('activity');
      } else if (viewParam === 'trending') {
        setViewMode('trending');
      } else {
        const matched = findTopicBySlugOrId(param, topics);
        if (matched) {
          setSelectedId(matched.id);
          setViewMode('watchlist');
        }
      }
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
    setRevision((r) => r + 1);
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
      setRevision((r) => r + 1);
      setError('');
    } catch (cause) { setError(cause.message); }
  }

  const [userPlan, setUserPlan] = useState(user?.plan || 'free');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(() => {
    const userId = user?.id || 'default';
    return localStorage.getItem(`notice_me_avatar_${userId}`) || user?.user_metadata?.avatar_url || '';
  });

  useEffect(() => {
    if (user?.plan) setUserPlan(user.plan);
    const userId = user?.id || 'default';
    const savedAvatar = localStorage.getItem(`notice_me_avatar_${userId}`) || user?.user_metadata?.avatar_url || '';
    setAvatarUrl(savedAvatar);
  }, [user]);

  useEffect(() => {
    getProfile().then((res) => {
      if (res?.user) {
        setUserProfile(res.user);
        if (res.user.plan) setUserPlan(res.user.plan);
      }
    }).catch(() => {});
  }, [revision]);

  function handleUpgradePlan() {
    setShowProModal(true);
  }

  const handleProfileUpdated = ({ avatar: newAvatar, name: newName }) => {
    if (newAvatar !== undefined) setAvatarUrl(newAvatar);
    if (newName !== undefined) {
      setUserProfile((prev) => ({ ...prev, name: newName }));
    }
  };

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
            <IconX size={16} />
          </button>
        </div>
        <div className="sidebar-intro"><span className="live-dot" /> Live SerpApi monitoring</div>
        <div className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-tab ${viewMode === 'activity' ? 'is-active' : ''}`}
            onClick={() => {
              setViewMode('activity');
              setSidebarOpen(false);
            }}
          >
            <div className="sidebar-nav-label">
              <span className="sidebar-nav-icon"><IconZap size={14} /></span>
              <span>What Changed</span>
            </div>
            <span className="sidebar-nav-badge">DIGEST</span>
          </button>
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
              <span className="sidebar-nav-icon"><IconFileText size={14} /></span>
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
              <span className="sidebar-nav-icon"><IconRadio size={14} /></span>
              <span>Trending Radar</span>
            </div>
            <span className="sidebar-nav-badge">RADAR</span>
          </button>
        </div>
        <TopicList
          topics={topics}
          selectedId={viewMode === 'watchlist' ? selectedId : null}
          user={{ ...user, plan: userPlan }}
          onUpgradePlan={handleUpgradePlan}
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
              <IconMenu size={18} />
            </button>
            <div className="topbar-breadcrumb">
              <span className="topbar-workspace-tag">WORKSPACE</span>
              <span className="topbar-divider">/</span>
              <span className="topbar-active-view">
                {viewMode === 'trending'
                  ? 'Trending Radar'
                  : viewMode === 'activity'
                  ? 'Intelligence Digest'
                  : (selected ? selected.name : 'Watchlist Overview')}
              </span>
            </div>
            <div className="topbar-telemetry-pill">
              <span className="live-pulse-dot" />
              <span>RADAR LIVE</span>
            </div>
          </div>
          <div className="topbar-search">
            <span className="topbar-search-icon" aria-hidden="true">
              <IconSearch size={14} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search topics, circulars, diffs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); searchInputRef.current?.blur(); } }}
              aria-label="Search topics and circulars"
            />
            {query ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
                title="Clear search"
                aria-label="Clear search"
              >
                <IconX size={13} />
              </button>
            ) : (
              <span className="search-kbd-hint">⌘K</span>
            )}
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="button button-quiet topbar-chat-btn"
              onClick={() => setShowChat(true)}
              title="Ask AI Analyst"
            >
              <IconSparkles size={14} />
              <span>Ask AI</span>
            </button>
            <button
              type="button"
              className={`plan-toggle-pill ${userPlan === 'pro' ? 'is-pro' : 'is-free'}`}
              onClick={() => setShowProModal(true)}
              title="Pro features coming soon"
            >
              {userPlan === 'pro' ? 'PRO TIER' : 'FREE TIER'}
            </button>
            <button
              type="button"
              className="topbar-avatar-btn"
              onClick={() => setShowProfileModal(true)}
              title={`Profile & Settings: ${userProfile?.name || user?.user_metadata?.name || 'Account'}`}
              aria-label="Open profile and settings"
            >
              {avatarUrl?.startsWith('data:image') || avatarUrl?.startsWith('http') ? (
                <img src={avatarUrl} alt="Profile" className="topbar-avatar-img" />
              ) : avatarUrl ? (
                <span className="topbar-avatar-icon">{avatarUrl}</span>
              ) : (
                <span className="user-avatar">
                  {(userProfile?.name?.trim()?.[0] || user?.user_metadata?.name?.trim()?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                </span>
              )}
            </button>
            <button type="button" className="button button-quiet topbar-btn" onClick={() => setRevision((value) => value + 1)} title="Refresh data">
              <IconRefresh size={13} />
              <span>Refresh</span>
            </button>
            <button type="button" className="button button-quiet topbar-btn" onClick={signOut} title="Sign out">
              <IconLogOut size={13} />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        {error && <p className="form-error page-error" role="alert">{error}</p>}
        {query.trim().length >= 2 ? (
          <div className="search-results-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div className="section-label">SEARCH RESULTS</div>
                <h2 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 700 }}>Results for “{query.trim()}”</h2>
              </div>
              <button type="button" className="button button-quiet" onClick={() => setQuery('')}>
                <IconX size={14} />
                <span>Close Search</span>
              </button>
            </div>
            {searching ? (
              <div className="empty-state" style={{ marginTop: '20px' }}>Searching topics & update history…</div>
            ) : (!searchResults?.topics?.length && !searchResults?.diffs?.length) ? (
              <div className="empty-state" style={{ marginTop: '20px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--bg-surface-elevated)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px'
                }}>
                  <IconSearch size={20} />
                </div>
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
                          onClick={() => { setSelectedId(t.id); setViewMode('watchlist'); setQuery(''); }}
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
            onRefresh={handleRefreshTrending}
            refreshing={refreshingTrending}
          />
        ) : viewMode === 'activity' ? (
          <RecentChangesFeed
            user={user}
            topics={topics}
            onSelectTopic={(id) => { setSelectedId(id); setViewMode('watchlist'); }}
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
          <RecentChangesFeed
            user={user}
            topics={topics}
            onSelectTopic={(id) => { setSelectedId(id); setViewMode('watchlist'); }}
          />
        )}
      </main>

      <button
        type="button"
        className="floating-ai-chat-btn"
        onClick={() => setShowChat(true)}
        title="Ask AI Intelligence Analyst"
      >
        <span className="floating-bot-icon">
          <IconSparkles size={16} />
        </span>
        <span className="floating-btn-label">Ask AI Analyst</span>
        <span className="floating-hot-dot" />
      </button>

      {showChat && (
        <React.Suspense fallback={null}>
          <AIChatModal
            isOpen={showChat}
            onClose={() => setShowChat(false)}
            activeTopic={viewMode === 'watchlist' ? selected : null}
            topics={topics}
          />
        </React.Suspense>
      )}

      {showProModal && (
        <React.Suspense fallback={null}>
          <ProModal isOpen={showProModal} onClose={() => setShowProModal(false)} />
        </React.Suspense>
      )}
      {showProfileModal && (
        <React.Suspense fallback={null}>
          <ProfileModal
            isOpen={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            userProfile={{ ...userProfile, plan: userPlan, topicCount: topics.length }}
            onProfileUpdated={handleProfileUpdated}
          />
        </React.Suspense>
      )}
    </div>
  );
}
