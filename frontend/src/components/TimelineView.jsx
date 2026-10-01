import React, { useState } from 'react';
import DiffCard from './DiffCard.jsx';

function getChangeImpact(change) {
  if (change?.structured?.impact) return change.structured.impact;
  const text = String(change?.summary || '').toLowerCase();
  if (/deadline|last date|cancel|postpone|stay order|court order|cutoff|hall ticket|admit card/i.test(text)) return 'HIGH';
  if (/extend|release|announced|update|fee|apply|eligibility|new result|decision|notification/i.test(text)) return 'MEDIUM';
  return 'LOW';
}

function getHeadline(change) {
  if (change?.structured?.headline) return change.structured.headline;
  const raw = String(change?.summary || '').trim();
  if (raw.startsWith('{')) {
    try {
      const p = JSON.parse(raw);
      if (p.headline) return p.headline;
    } catch {}
  }
  return raw.split('\n')[0].replace(/^.*:\s*/, '').slice(0, 75) || 'Milestone updated';
}

export default function TimelineView({ diffs = [], loading }) {
  const [filter, setFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState(() => (diffs[0]?.id || null));

  const filteredDiffs = diffs.filter((d) => {
    if (filter === 'ALL') return true;
    return getChangeImpact(d) === filter;
  });

  return (
    <section aria-labelledby="timeline-heading" className="timeline-section">
      <div className="section-heading">
        <div>
          <div className="section-label">CHRONOLOGICAL AUDIT TRAIL</div>
          <h2 id="timeline-heading" style={{ margin: '4px 0 0' }}>Verified Change Timeline</h2>
        </div>
        <div className="timeline-filter-pills">
          <button
            type="button"
            className={`filter-pill ${filter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            All ({diffs.length})
          </button>
          <button
            type="button"
            className={`filter-pill is-high ${filter === 'HIGH' ? 'is-active' : ''}`}
            onClick={() => setFilter('HIGH')}
          >
            🔴 High Impact ({diffs.filter((d) => getChangeImpact(d) === 'HIGH').length})
          </button>
          <button
            type="button"
            className={`filter-pill is-medium ${filter === 'MEDIUM' ? 'is-active' : ''}`}
            onClick={() => setFilter('MEDIUM')}
          >
            🟠 Medium ({diffs.filter((d) => getChangeImpact(d) === 'MEDIUM').length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading timeline…</div>
      ) : diffs.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true" style={{ fontSize: '32px' }}>✓</span>
          <h3>Baseline recorded — no changes detected yet</h3>
          <p>
            Notice Me continuously monitors Search and News for official revisions. Any material date shifts, vacancy revisions, or eligibility notices will be redlined here.
          </p>
        </div>
      ) : filteredDiffs.length === 0 ? (
        <div className="empty-state">
          <p>No changes match the selected filter “{filter}”.</p>
          <button type="button" className="button button-quiet" onClick={() => setFilter('ALL')}>
            Show all changes
          </button>
        </div>
      ) : (
        <div className="timeline-stepper">
          {filteredDiffs.map((change, index) => {
            const impact = getChangeImpact(change);
            const headline = getHeadline(change);
            const date = new Date(change.detectedAt);
            const monthDay = Number.isNaN(date.getTime())
              ? 'Recent'
              : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = Number.isNaN(date.getTime())
              ? ''
              : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const isExpanded = expandedId === change.id || filteredDiffs.length === 1;

            return (
              <div
                key={change.id}
                className={`timeline-step impact-${impact.toLowerCase()} ${isExpanded ? 'is-open' : ''}`}
              >
                <div className="timeline-node-track">
                  <div className={`timeline-node-circle impact-${impact.toLowerCase()}`}>
                    <span className="node-dot" />
                  </div>
                  {index < filteredDiffs.length - 1 && <div className="timeline-track-line" />}
                </div>

                <div className="timeline-step-content">
                  <div
                    className="timeline-summary-bar"
                    onClick={() => setExpandedId(isExpanded ? null : change.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(isExpanded ? null : change.id); }}
                    aria-expanded={isExpanded}
                  >
                    <div className="timeline-bar-left">
                      <div className="timeline-date-chip">
                        <strong>{monthDay}</strong>
                        {timeStr && <small>{timeStr}</small>}
                      </div>
                      <div className="timeline-bar-title">
                        <span className={`impact-badge impact-${impact.toLowerCase()}`}>
                          {impact}
                        </span>
                        <span className="headline-text">{headline}</span>
                      </div>
                    </div>
                    <div className="timeline-bar-action">
                      <span>{isExpanded ? 'Hide details ▴' : 'View AI breakdown ▾'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="timeline-expanded-card">
                      <DiffCard change={change} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
