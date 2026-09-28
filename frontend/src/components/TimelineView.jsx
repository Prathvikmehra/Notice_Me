import React from 'react';
import DiffCard from './DiffCard.jsx';

export default function TimelineView({ diffs, loading }) {
  return (
    <section aria-labelledby="timeline-heading" className="timeline-section">
      <div className="section-heading"><h2 id="timeline-heading">Change timeline</h2><span>{diffs.length} updates</span></div>
      {loading ? <p className="empty-state">Loading timeline…</p> : diffs.length === 0 ? (
        <div className="empty-state"><span aria-hidden="true">◌</span><h3>No changes yet</h3><p>We compare every pull with the one before it. New updates will appear here with their sources.</p></div>
      ) : <div className="timeline-list">{diffs.map((change) => <DiffCard key={change.id} change={change} />)}</div>}
    </section>
  );
}
