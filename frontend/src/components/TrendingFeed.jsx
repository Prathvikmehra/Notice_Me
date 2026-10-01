import React, { useState, useEffect } from 'react';

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Hot Tracks' },
  { id: 'exam', label: '🎓 Exams & Admissions' },
  { id: 'scheme', label: '🌾 Govt Schemes' },
  { id: 'case', label: '⚖️ Court & Legal' },
  { id: 'recruitment', label: '🎖️ Recruitment' },
  { id: 'policy', label: '📜 Public Policy' },
];

export default function TrendingFeed({
  trending = [],
  userTopics = [],
  onTrack,
  onSelectExisting,
  onRefresh,
  refreshing = false,
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [trackingId, setTrackingId] = useState(null);

  const isTracking = (item) => {
    return userTopics.some(
      (t) => t.query.toLowerCase().trim() === item.query.toLowerCase().trim() ||
             t.name.toLowerCase().trim() === item.name.toLowerCase().trim()
    );
  };

  const getExistingTopic = (item) => {
    return userTopics.find(
      (t) => t.query.toLowerCase().trim() === item.query.toLowerCase().trim() ||
             t.name.toLowerCase().trim() === item.name.toLowerCase().trim()
    );
  };

  const filtered = trending.filter((item) => {
    if (filter !== 'all' && item.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const match = item.name.toLowerCase().includes(q) ||
                    item.headline.toLowerCase().includes(q) ||
                    item.description.toLowerCase().includes(q) ||
                    item.officialSource.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  async function handleTrack(item) {
    setTrackingId(item.id);
    try {
      await onTrack({
        name: item.name,
        query: item.query,
        category: item.category,
      });
    } finally {
      setTrackingId(null);
    }
  }

  const hasPlaceholders = trending.some((t) => t.isPlaceholder);

  // Auto-poll every 3s if currently displaying placeholders until live radar data arrives
  useEffect(() => {
    if (!hasPlaceholders || !onRefresh) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (!cancelled) {
        await onRefresh(false);
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasPlaceholders, onRefresh]);

  return (
    <div className="trending-feed">
      {/* 1. Live Breaking Radar Ticker */}
      <div className="radar-ticker-banner" role="region" aria-label="Live breaking updates ticker">
        <div className={`ticker-badge ${hasPlaceholders ? 'ticker-badge-placeholder' : ''}`}>
          <span className={hasPlaceholders ? 'offline-dot' : 'live-dot'} />
          <span>{hasPlaceholders ? 'DEMO SPECIMENS' : 'LIVE RADAR'}</span>
        </div>
        <div className="ticker-track">
          <div className="ticker-inner">
            {trending.map((item, idx) => (
              <span key={idx} className="ticker-item">
                <strong>{item.name}:</strong> “{item.headline.slice(0, 75)}…”
                <span className="ticker-sep">✦</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Editorial Header */}
      <div className="trending-header">
        <div className="trending-eyebrow">
          <span>PUBLIC INTELLIGENCE FEED</span>
          <span className="trending-stat-pill">⚡ SERPAPI + GEMINI REAL-TIME RADAR</span>
          {onRefresh && (
            <button
              type="button"
              className="button button-quiet trending-refresh-btn"
              onClick={() => onRefresh(true)}
              disabled={refreshing}
              style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 12px', cursor: 'pointer' }}
              title="Force re-fetch live trending notices from SerpApi"
            >
              {refreshing ? '↻ Fetching radar…' : '↻ Refresh Radar'}
            </button>
          )}
        </div>
        <h1>Trending Public Notices</h1>
        <p className="trending-subtitle">
          Hot official notices, national entrance exams, welfare subsidies, and Supreme Court rulings.
          Click <strong>Track this notice</strong> to instantly add real-time monitoring and email alerts to your watchlist.
        </p>

        {hasPlaceholders && (
          <div className="placeholder-disclaimer-banner" role="alert">
            <span className="disclaimer-badge">⚠️ OFFLINE DEMO SPECIMENS</span>
            <span className="disclaimer-text">
              Live Google Trends background sync is finalizing.
              {onRefresh && (
                <button
                  type="button"
                  onClick={() => onRefresh(true)}
                  disabled={refreshing}
                  style={{ marginLeft: '8px', textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {refreshing ? 'Refreshing…' : 'Check for live data now ↗'}
                </button>
              )}
            </span>
          </div>
        )}

        {/* Filter Bar & Search */}
        <div className="trending-controls">
          <div className="trending-filters" role="tablist">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`filter-pill ${filter === cat.id ? 'is-active' : ''}`}
                onClick={() => setFilter(cat.id)}
              >
                {cat.label}
                {cat.id === 'all' && <span className="pill-count">{trending.length}</span>}
              </button>
            ))}
          </div>

          <div className="trending-search-wrap">
            <input
              type="search"
              placeholder="Filter hot notices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="trending-search-input"
            />
          </div>
        </div>
      </div>

      {/* 3. Newsroom Cards Grid */}
      <div className="trending-grid">
        {filtered.map((item) => {
          const tracked = isTracking(item);
          const existing = getExistingTopic(item);
          const isBusy = trackingId === item.id;

          return (
            <article key={item.id} className={`trending-card ${item.isPlaceholder ? 'is-placeholder-card' : ''}`}>
              <div className="card-top-meta">
                <div className="meta-left">
                  <span className={`trending-category-tag cat-${item.category}`}>
                    {item.category.toUpperCase()}
                  </span>
                  <span className={`trending-badge-tag ${item.isPlaceholder ? 'badge-placeholder' : ''}`}>
                    {item.badge}
                  </span>
                </div>
                {tracked && (
                  <span className="trending-tracked-badge" title="You are tracking this notice">
                    ✓ IN WATCHLIST
                  </span>
                )}
              </div>

              <div className="card-body">
                <h2 className="trending-title">{item.name}</h2>
                <blockquote className="trending-headline">
                  “{item.headline}”
                </blockquote>
                <p className="trending-desc">{item.description}</p>
              </div>

              <div className="card-source-bar">
                <div className="source-info">
                  <span className="source-label">OFFICIAL SOURCE:</span>
                  <span className="source-domain">{item.officialSource}</span>
                </div>
                <div className="query-info">
                  <span className="source-label">RADAR QUERY:</span>
                  <span className="query-snippet">“{item.query}”</span>
                </div>
              </div>

              <div className="card-footer">
                {tracked ? (
                  <div className="tracked-status-row">
                    <span className="tracked-check">✓ Added to your watchlist</span>
                    {existing && (
                      <button
                        type="button"
                        className="button button-quiet view-intel-btn"
                        onClick={() => onSelectExisting(existing.id)}
                      >
                        View Intelligence ↗
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button button-primary track-notice-btn"
                    disabled={isBusy}
                    onClick={() => handleTrack(item)}
                  >
                    {isBusy ? '⚡ Initializing Radar…' : '⚡ Track this Notice (1-Click)'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state" style={{ marginTop: '40px' }}>
          <span aria-hidden="true">📡</span>
          <h3>No matching notices</h3>
          <p>Try selecting another category or clearing your filter term.</p>
        </div>
      )}
    </div>
  );
}
