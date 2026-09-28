import React from 'react';

export default function DiffCard({ change }) {
  const date = new Date(change.detectedAt);
  return (
    <article className="diff-card">
      <div className="diff-topline"><time dateTime={change.detectedAt}>{Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()}</time><span className="change-badge">CHANGE DETECTED</span></div>
      <div className="diff-summary">{change.summary}</div>
      {change.sourceUrls.length > 0 && <div className="source-links"><span>Sources</span>{change.sourceUrls.map((url) => {
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) return null;
          return <a href={url} key={url} target="_blank" rel="noopener noreferrer">{parsed.hostname.replace(/^www\./, '')} ↗</a>;
        } catch { return null; }
      })}</div>}
    </article>
  );
}
