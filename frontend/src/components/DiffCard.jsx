import React from 'react';

function renderDiffLine(line, index) {
  if (line.includes(' → ')) {
    const [before, after] = line.split(' → ');
    const colonIdx = before.indexOf(': ');
    if (colonIdx !== -1) {
      const prefix = before.slice(0, colonIdx + 2);
      const oldText = before.slice(colonIdx + 2);
      return (
        <div key={index} className="diff-line">
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{prefix}</span>
          <span className="diff-old">{oldText}</span>
          <span className="diff-arrow"> → </span>
          <span className="diff-new">{after}</span>
        </div>
      );
    }
    return (
      <div key={index} className="diff-line">
        <span className="diff-old">{before}</span>
        <span className="diff-arrow"> → </span>
        <span className="diff-new">{after}</span>
      </div>
    );
  }

  if (line.startsWith('New result:')) {
    return (
      <div key={index} className="diff-line">
        <span style={{ color: '#166534', fontWeight: 600, marginRight: '6px' }}>+ New:</span>
        <strong>{line.replace(/^New result:\s*/, '')}</strong>
      </div>
    );
  }

  if (line.startsWith('Removed result:')) {
    return (
      <div key={index} className="diff-line">
        <span style={{ color: 'var(--seal)', fontWeight: 600, marginRight: '6px' }}>− Removed:</span>
        <span className="diff-old">{line.replace(/^Removed result:\s*/, '')}</span>
      </div>
    );
  }

  return <div key={index} className="diff-line">{line}</div>;
}

export default function DiffCard({ change }) {
  const date = new Date(change.detectedAt);
  const lines = (change.summary || '').split('\n').filter(Boolean);

  return (
    <article className="diff-card">
      <div className="diff-topline">
        <time dateTime={change.detectedAt}>
          {Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </time>
        <span className="change-badge">Material change detected</span>
      </div>
      <div className="diff-summary">
        {lines.map((line, idx) => renderDiffLine(line, idx))}
      </div>
      {change.sourceUrls?.length > 0 && (
        <div className="source-links">
          <span>Sources</span>
          {change.sourceUrls.map((url) => {
            try {
              const parsed = new URL(url);
              if (!['http:', 'https:'].includes(parsed.protocol)) return null;
              return (
                <a
                  href={url}
                  key={url}
                  className="source-link-chip"
                  target="_blank"
                  rel="noopener noreferrer"
                  title={url}
                >
                  {parsed.hostname.replace(/^www\./, '')} ↗
                </a>
              );
            } catch {
              return null;
            }
          })}
        </div>
      )}
    </article>
  );
}
