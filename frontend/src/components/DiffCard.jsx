import React, { useState } from 'react';
import {
  IconAlertTriangle,
  IconCheck,
  IconExternalLink,
  IconShield,
  IconFileText,
  IconUser,
  IconChevronDown,
  IconArrowRight,
} from './Icons.jsx';

function cleanExplanation(text) {
  if (!text) return 'Change detected in official records or web index.';
  if (!text.includes('New result:') && !text.includes('Removed result:') && !text.includes('\n')) {
    return text.trim();
  }
  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const changedLines = rawLines.filter((l) => !l.startsWith('New result:') && !l.startsWith('Removed result:'));
  if (changedLines.length > 0) {
    return changedLines.join(' • ');
  }
  const newCount = rawLines.filter((l) => l.startsWith('New result:')).length;
  const removedCount = rawLines.filter((l) => l.startsWith('Removed result:')).length;
  if (newCount > 0 || removedCount > 0) {
    const parts = [];
    if (newCount > 0) parts.push(`${newCount} new search result${newCount === 1 ? '' : 's'}`);
    if (removedCount > 0) parts.push(`${removedCount} outdated result${removedCount === 1 ? '' : 's'} removed`);
    return `Search index update: ${parts.join(', ')}.`;
  }
  return text.trim();
}

function sanitizeTextValue(val) {
  if (!val || typeof val !== 'string') return null;
  let s = val.trim();
  if (s.includes('\n') || s.includes('New result:') || s.includes('Removed result:')) {
    const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
    const target = lines[lines.length - 1] || '';
    s = target.includes(':') ? target.slice(target.lastIndexOf(':') + 1).trim() : target;
  }
  s = s.replace(/^["'`]|["'`]$/g, '').trim();
  return s || null;
}

function parseStructuredChange(change) {
  if (change?.structured && typeof change.structured === 'object') {
    const s = { ...change.structured };
    s.before = sanitizeTextValue(s.before);
    s.after = sanitizeTextValue(s.after);
    s.explanation = cleanExplanation(s.explanation);
    return s;
  }

  const raw = change?.summary || '';
  const text = String(raw).trim();

  // Try JSON parse first
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.headline === 'string') {
        parsed.before = sanitizeTextValue(parsed.before);
        parsed.after = sanitizeTextValue(parsed.after);
        parsed.explanation = cleanExplanation(parsed.explanation);
        if (Array.isArray(parsed.evidence)) {
          parsed.evidence = parsed.evidence.map((ev) => ({
            ...ev,
            excerpt: cleanExplanation(ev.excerpt || ''),
          }));
        }
        return parsed;
      }
    } catch {}
  }

  // Fallback parsing for legacy text diffs
  const isCritical = /deadline|last date|cancel|postpone|stay order|court order|cutoff|hall ticket|admit card|urgent|scheduled|verdict/i.test(text);
  const isModerate = /extend|release|announced|update|fee|apply|eligibility|new result|decision|notification/i.test(text);
  const impact = isCritical ? 'HIGH' : isModerate ? 'MEDIUM' : 'LOW';

  let before = null;
  let after = null;
  if (text.includes(' → ')) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const changeLine = lines.find((l) => l.includes(' → '));
    if (changeLine) {
      const parts = changeLine.split(' → ');
      const rawBefore = parts[0].includes(':')
        ? parts[0].slice(parts[0].lastIndexOf(':') + 1).trim()
        : parts[0].trim();
      before = rawBefore.replace(/^["'`]|["'`]$/g, '').trim() || null;
      after = (parts[1] || '').split('\n')[0].replace(/^["'`]|["'`]$/g, '').trim() || null;
    }
  }

  const explanation = cleanExplanation(text);

  const evidence = (change?.sourceUrls || []).slice(0, 4).map((url) => {
    let domain = 'source';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    const isGov = /\.(gov|nic|ac|edu)\.in$|\.gov$|court|judicature/i.test(domain);
    return {
      title: `${change?.topic?.name || 'Monitored'} Source`,
      url,
      domain,
      sourceType: isGov ? 'Official Portal' : 'Public Web Source',
      excerpt: explanation.slice(0, 160) || 'Verified intelligence match.',
    };
  });

  const headline = text.includes('\n')
    ? text.split('\n')[0].replace(/^.*:\s*/, '').slice(0, 90)
    : (text.length > 90 ? `${text.slice(0, 87)}…` : (text || 'Update Detected'));

  return {
    headline: headline || 'Update Detected',
    explanation,
    before,
    after,
    whyItMatters: isCritical
      ? 'Directly alters critical deadlines, applicant eligibility, or administrative instructions.'
      : 'Provides refreshed administrative updates and latest public circular records.',
    whoIsAffected: change?.topic?.name ? `Candidates and stakeholders tracking ${change.topic.name}` : null,
    actionRequired: isCritical ? 'Review updated timelines and verify documents on the official portal.' : null,
    impact,
    whyAmISeeingThis: [
      change?.topic?.query ? `Matches monitored query: "${change.topic.query}"` : 'Matches your monitoring watchlist',
      evidence.some((e) => e.sourceType === 'Official Portal') ? 'Verified official source publication' : 'Detected in latest search & news crawl',
    ],
    evidence,
  };
}

export default function DiffCard({ change, compact = false }) {
  const [showWhy, setShowWhy] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  const structured = parseStructuredChange(change);
  const date = new Date(change.detectedAt);
  const formattedDate = Number.isNaN(date.getTime())
    ? 'Recently'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const impact = structured.impact || 'MEDIUM';
  const impactClass = impact === 'HIGH' ? 'is-high' : impact === 'MEDIUM' ? 'is-medium' : 'is-low';

  const sources = structured.evidence?.length > 0
    ? structured.evidence
    : (change.sourceUrls || []).map((url) => {
      let domain = 'source';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      return { url, domain, title: domain, sourceType: 'Web Source', excerpt: null };
    });

  const displayedSources = showAllSources ? sources : sources.slice(0, 2);

  return (
    <article className={`diff-card interactive-card ${impactClass} ${compact ? 'is-compact' : ''}`}>
      <header className="diff-topline">
        <div className="diff-topline-left">
          <span className={`diff-impact-pill ${impactClass}`}>
            <span className="impact-beacon" aria-hidden="true">
              <span className="live-dot" style={{
                backgroundColor: impact === 'HIGH' ? 'var(--status-high-dot)' : impact === 'MEDIUM' ? 'var(--status-med-dot)' : 'var(--status-low-dot)',
                width: '6px',
                height: '6px',
              }} />
            </span>
            <span>{impact} IMPACT</span>
          </span>
          <time className="diff-time" dateTime={change.detectedAt}>
            {formattedDate}
          </time>
          {change.topic?.name && (
            <span className="diff-topic-tag" title={change.topic.name}>
              {change.topic.name}
            </span>
          )}
        </div>
        <button
          type="button"
          className="why-toggle-btn"
          onClick={() => setShowWhy((v) => !v)}
          title="Why am I seeing this change?"
          aria-expanded={showWhy}
        >
          <span>{showWhy ? 'Hide rationale' : 'Why this alert?'}</span>
          <IconChevronDown size={13} style={{ transform: showWhy ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </button>
      </header>

      {showWhy && (
        <aside className="diff-why-card">
          <div className="diff-why-title">Alert Verification Rationale</div>
          <ul className="diff-why-list">
            {(structured.whyAmISeeingThis || [
              `Matches your query preferences.`,
              `Detected in verified public intelligence index.`
            ]).map((reason, idx) => (
              <li key={idx}>
                <IconCheck size={13} className="why-check" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className="diff-body">
        <h3 className="diff-headline">{structured.headline}</h3>
        <p className="diff-explanation">{structured.explanation}</p>

        {(structured.before || structured.after) && (
          <div className="diff-comparison-grid">
            <div className="diff-box diff-box-before">
              <div className="diff-box-top">
                <span className="diff-box-prefix">-</span>
                <span className="diff-box-label">PREVIOUS STATE</span>
              </div>
              <span className="diff-box-value">{structured.before || '—'}</span>
            </div>
            <div className="diff-comparison-arrow" aria-hidden="true">
              <IconArrowRight size={14} />
            </div>
            <div className="diff-box diff-box-after">
              <div className="diff-box-top">
                <span className="diff-box-prefix">+</span>
                <span className="diff-box-label">VERIFIED UPDATE</span>
              </div>
              <span className="diff-box-value">{structured.after || '—'}</span>
            </div>
          </div>
        )}

        <div className="diff-meta-row">
          {structured.whyItMatters && (
            <div className="diff-meta-item">
              <span className="meta-icon"><IconFileText size={14} /></span>
              <div>
                <strong>Why it matters:</strong> {structured.whyItMatters}
              </div>
            </div>
          )}
          {structured.whoIsAffected && (
            <div className="diff-meta-item">
              <span className="meta-icon"><IconUser size={14} /></span>
              <div>
                <strong>Who is affected:</strong> {structured.whoIsAffected}
              </div>
            </div>
          )}
        </div>

        {structured.actionRequired && (
          <div className="diff-action-banner">
            <span className="action-icon"><IconAlertTriangle size={15} /></span>
            <div className="action-text">
              <strong>Action Recommended:</strong> {structured.actionRequired}
            </div>
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <footer className="diff-evidence-section">
          <div className="evidence-header">
            <span className="evidence-label">EVIDENCE &amp; SOURCES ({sources.length})</span>
            {sources.length > 2 && (
              <button
                type="button"
                className="evidence-toggle-btn"
                onClick={() => setShowAllSources((v) => !v)}
              >
                {showAllSources ? 'Show fewer' : `+${sources.length - 2} more sources`}
              </button>
            )}
          </div>
          <div className="evidence-list">
            {displayedSources.map((src, idx) => (
              <div key={idx} className="evidence-card">
                <div className="evidence-card-top">
                  <div className="evidence-source-info">
                    <span className={`source-type-pill ${src.sourceType === 'Official Portal' ? 'is-official' : ''}`}>
                      {src.sourceType === 'Official Portal' && <IconShield size={11} style={{ marginRight: '3px' }} />}
                      {src.sourceType || 'Source'}
                    </span>
                    <span className="evidence-domain">{src.domain}</span>
                    {src.date && <span className="evidence-date">• {src.date}</span>}
                  </div>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="view-source-btn"
                    title={`Open ${src.url}`}
                  >
                    <span>View Record</span>
                    <IconExternalLink size={12} />
                  </a>
                </div>
                {src.title && <div className="evidence-title">{src.title}</div>}
                {src.excerpt && (
                  <blockquote className="evidence-excerpt">
                    “{src.excerpt}”
                  </blockquote>
                )}
              </div>
            ))}
          </div>
        </footer>
      )}
    </article>
  );
}
