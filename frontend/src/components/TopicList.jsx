import React from 'react';

export default function TopicList({ topics, selectedId, onSelect }) {
  return (
    <nav className="topic-nav" aria-label="Tracked topics">
      <div className="section-heading">
        <span>WATCHLIST</span>
        <span>{topics.length}/5 FREE</span>
      </div>
      {topics.length === 0 && <p className="list-empty" style={{ color: '#94A3B8', fontSize: '12px', padding: '12px 8px' }}>No tracked topics yet. Add your first topic below.</p>}
      {topics.map((topic) => (
        <button key={topic.id} type="button" className={`topic-link ${selectedId === topic.id ? 'selected' : ''}`} onClick={() => onSelect(topic.id)} aria-current={selectedId === topic.id ? 'page' : undefined}>
          <span className="topic-icon" aria-hidden="true">{topic.category === 'exam' || topic.category === 'recruitment' ? '▤' : topic.category === 'case' ? '§' : topic.category === 'policy' ? '¶' : topic.category === 'admission' ? '🎓' : '◈'}</span>
          <span className="topic-link-text">
            <strong>{topic.name}</strong>
            <small>{topic.category || 'Topic'}</small>
          </span>
          <span className="topic-chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </nav>
  );
}
