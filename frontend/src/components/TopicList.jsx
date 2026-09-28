import React from 'react';

export default function TopicList({ topics, selectedId, onSelect }) {
  return (
    <nav className="topic-nav" aria-label="Tracked topics">
      <div className="section-heading"><span>YOUR WATCHLIST</span><span>{topics.length}/5</span></div>
      {topics.length === 0 && <p className="muted list-empty">Add a topic to start collecting updates.</p>}
      {topics.map((topic) => (
        <button key={topic.id} type="button" className={`topic-link ${selectedId === topic.id ? 'selected' : ''}`} onClick={() => onSelect(topic.id)} aria-current={selectedId === topic.id ? 'page' : undefined}>
          <span className="topic-icon" aria-hidden="true">{topic.category === 'exam' || topic.category === 'recruitment' ? '▤' : topic.category === 'case' ? '§' : topic.category === 'policy' ? '¶' : topic.category === 'admission' ? '🎓' : '◈'}</span>
          <span className="topic-link-text"><strong>{topic.name}</strong><small>{topic.category || 'topic'}</small></span>
          <span className="topic-chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </nav>
  );
}
