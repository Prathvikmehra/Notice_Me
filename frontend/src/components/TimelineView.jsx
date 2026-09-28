import React from 'react';
import DiffCard from './DiffCard.jsx';

export default function TimelineView({ diffs, loading }) {
  return (
    <section aria-labelledby="timeline-heading" className="timeline-section">
      <div className="section-heading">
        <h2 id="timeline-heading">Change timeline</h2>
        <span className="timeline-count">{diffs.length} verified {diffs.length === 1 ? 'update' : 'updates'}</span>
      </div>
      {loading ? (
        <div className="empty-state">Loading timeline…</div>
      ) : diffs.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">✓</span>
          <h3>Baseline recorded — no changes detected</h3>
          <p>
            Notice Me compares each live pull against previous search & news records. Any material date shifts, vacancy revisions, or eligibility updates will be redlined here.
          </p>
        </div>
      ) : (
        <div className="timeline-list">
          {diffs.map((change) => (
            <DiffCard key={change.id} change={change} />
          ))}
        </div>
      )}
    </section>
  );
}
