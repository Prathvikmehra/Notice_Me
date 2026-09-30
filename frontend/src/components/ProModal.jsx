import React, { useEffect } from 'react';

export default function ProModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="pro-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pro-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="pro-modal-header">
          <div className="pro-modal-title">
            <span className="pro-emblem">⚡</span>
            <span>PRO TIER — COMING SOON</span>
          </div>
          <button
            type="button"
            className="pro-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="pro-modal-body">
          <div className="pro-modal-badge">IN ACTIVE DEVELOPMENT</div>
          <h2 className="pro-modal-heading">Pro Features Coming Soon</h2>
          <p className="pro-modal-sub">
            The Pro subscription tier is currently in development and not yet available for purchase.
          </p>

          <div className="pro-features-preview">
            <div className="pro-feature-item">
              <span className="pro-feature-icon">📑</span>
              <div>
                <strong>Unlimited Topic Watchlists</strong>
                <p>Expand beyond the 5-topic preview limit to monitor unlimited public notices, exams, and policies.</p>
              </div>
            </div>
            <div className="pro-feature-item">
              <span className="pro-feature-icon">⚡</span>
              <div>
                <strong>Real-Time 15-Minute Sync</strong>
                <p>High-frequency SerpApi ingestion with dedicated API capacity and zero cooldown pauses.</p>
              </div>
            </div>
            <div className="pro-feature-item">
              <span className="pro-feature-icon">📢</span>
              <div>
                <strong>Webhook & Slack Integrations</strong>
                <p>Direct payload dispatch to Discord, Slack, and internal government circular aggregators.</p>
              </div>
            </div>
            <div className="pro-feature-item">
              <span className="pro-feature-icon">🧠</span>
              <div>
                <strong>Gemini 3.5 Flash Dossier Exports</strong>
                <p>Deep multi-source synthesis with automated executive memos and cross-topic trend analysis.</p>
              </div>
            </div>
          </div>

          <div className="pro-modal-beta-notice">
            <span className="beta-flag">OPEN BETA</span>
            <span>
              All core monitoring, timeline diffing, urgency radars, and email alerts remain <strong>100% free and fully functional</strong> during this evaluation period.
            </span>
          </div>

          <div className="pro-modal-actions">
            <button
              type="button"
              className="button button-primary pro-confirm-btn"
              onClick={onClose}
            >
              Got It, Keep Exploring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
