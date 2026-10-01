import React, { useState, useEffect } from 'react';
import DiffCard from './DiffCard.jsx';
import { getRecentChanges } from '../api/client.js';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function RecentChangesFeed({ user, topics = [], onSelectTopic }) {
  const [diffs, setDiffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    let active = true;
    setLoading(true);
    getRecentChanges(30)
      .then((items) => {
        if (active) setDiffs(items || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [topics]);

  const highCount = diffs.filter((d) => (d.structured?.impact || 'MEDIUM') === 'HIGH').length;
  const mediumCount = diffs.filter((d) => (d.structured?.impact || 'MEDIUM') === 'MEDIUM').length;
  const lowCount = diffs.filter((d) => (d.structured?.impact || 'MEDIUM') === 'LOW').length;

  const filteredDiffs = diffs.filter((d) => {
    if (filter === 'ALL') return true;
    return (d.structured?.impact || 'MEDIUM') === filter;
  });

  const userName = user?.name || user?.email?.split('@')[0] || 'there';

  return (
    <div className="activity-feed-panel">
      <header className="activity-hero-header">
        <div className="activity-greeting-col">
          <span className="activity-pretitle">INTELLIGENCE DIGEST</span>
          <h1 className="activity-title">{getGreeting()}, {userName}</h1>
          <p className="activity-subtitle">
            {diffs.length > 0 ? (
              <>
                <strong>{diffs.length} meaningful {diffs.length === 1 ? 'change' : 'changes'}</strong> detected across your {topics.length} active {topics.length === 1 ? 'monitor' : 'monitors'}.
              </>
            ) : (
              `All ${topics.length} monitors up to date. No new material shifts detected.`
            )}
          </p>
        </div>

        <div className="activity-stats-grid">
          <div className="activity-stat-card is-high">
            <span className="stat-label">HIGH IMPACT</span>
            <span className="stat-value">{highCount}</span>
            <span className="stat-desc">Deadlines / Stays</span>
          </div>
          <div className="activity-stat-card is-medium">
            <span className="stat-label">MODERATE</span>
            <span className="stat-value">{mediumCount}</span>
            <span className="stat-desc">Releases / Circulars</span>
          </div>
          <div className="activity-stat-card is-monitors">
            <span className="stat-label">MONITORS</span>
            <span className="stat-value">{topics.length}</span>
            <span className="stat-desc">Search + News radar</span>
          </div>
        </div>
      </header>

      <div className="activity-filter-bar">
        <div className="activity-filter-pills">
          <button
            type="button"
            className={`feed-pill ${filter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            All Shifts ({diffs.length})
          </button>
          <button
            type="button"
            className={`feed-pill is-high ${filter === 'HIGH' ? 'is-active' : ''}`}
            onClick={() => setFilter('HIGH')}
          >
            🔴 High Impact ({highCount})
          </button>
          <button
            type="button"
            className={`feed-pill is-medium ${filter === 'MEDIUM' ? 'is-active' : ''}`}
            onClick={() => setFilter('MEDIUM')}
          >
            🟠 Moderate ({mediumCount})
          </button>
          {lowCount > 0 && (
            <button
              type="button"
              className={`feed-pill is-low ${filter === 'LOW' ? 'is-active' : ''}`}
              onClick={() => setFilter('LOW')}
            >
              🟡 Low Impact ({lowCount})
            </button>
          )}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {loading ? (
        <div className="empty-page" style={{ minHeight: '300px' }}>
          Loading intelligence feed across topics…
        </div>
      ) : diffs.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '24px' }}>
          <span aria-hidden="true" style={{ fontSize: '36px' }}>🛡️</span>
          <h3>All monitors steady — no changes detected</h3>
          <p>
            Notice Me watches Google Search & News continuously. When an official announcement, date extension, or court order appears, the verified AI breakdown will be highlighted here.
          </p>
        </div>
      ) : filteredDiffs.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '24px' }}>
          <p>No changes found matching the “{filter}” impact filter.</p>
          <button type="button" className="button button-quiet" onClick={() => setFilter('ALL')}>
            Show All Shifts
          </button>
        </div>
      ) : (
        <div className="activity-diff-list">
          {filteredDiffs.map((d) => (
            <div key={d.id} className="activity-diff-wrapper">
              <div className="activity-topic-banner">
                <span className="topic-pin-icon">📌</span>
                <span className="topic-banner-name">{d.topic?.name || 'Monitored Topic'}</span>
                <span className="topic-banner-category">{d.topic?.category || 'General'}</span>
                {onSelectTopic && d.topic?.id && (
                  <button
                    type="button"
                    className="view-topic-link"
                    onClick={() => onSelectTopic(d.topic.id)}
                  >
                    Open Topic Detail ↗
                  </button>
                )}
              </div>
              <DiffCard change={d} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
