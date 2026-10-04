import React from 'react';
import { IconChevronRight, IconTag } from './Icons.jsx';

export default function TopicList({ topics, selectedId, onSelect, user, onUpgradePlan }) {
  const isPro = user?.plan === 'pro';

  return (
    <nav className="topic-nav" aria-label="Tracked topics">
      <div className="section-heading">
        <span>WATCHLIST</span>
        <span className={`plan-badge ${isPro ? 'pro-badge' : ''}`}>
          {isPro ? 'PRO UNLIMITED' : `${topics.length}/5 MONITORS`}
        </span>
      </div>
      {!isPro && topics.length >= 5 && onUpgradePlan && (
        <div style={{ padding: '0 4px 8px' }}>
          <button
            type="button"
            className="button button-primary"
            style={{ width: '100%', fontSize: '11px', padding: '6px', minHeight: '28px' }}
            onClick={onUpgradePlan}
          >
            Upgrade Capacity
          </button>
        </div>
      )}
      {topics.length === 0 && (
        <p className="list-empty" style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px 6px' }}>
          No tracked topics yet. Add a monitor below.
        </p>
      )}
      {topics.map((topic) => (
        <button
          key={topic.id}
          type="button"
          className={`topic-link ${selectedId === topic.id ? 'selected' : ''}`}
          onClick={() => onSelect(topic.id)}
          aria-current={selectedId === topic.id ? 'page' : undefined}
        >
          <span className="topic-icon" aria-hidden="true">
            <IconTag size={12} />
          </span>
          <span className="topic-link-text">
            <strong>{topic.name}</strong>
            <small>{topic.category || 'general'}</small>
          </span>
          <IconChevronRight size={13} className="topic-chevron" />
        </button>
      ))}
    </nav>
  );
}
