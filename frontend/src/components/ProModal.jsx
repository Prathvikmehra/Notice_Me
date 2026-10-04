import React, { useEffect } from 'react';
import {
  IconZap,
  IconX,
  IconFileText,
  IconRadio,
  IconSparkles,
} from './Icons.jsx';

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
            <IconZap size={16} style={{ color: 'var(--brand-primary)' }} />
            <span>PRO TIER — COMING SOON</span>
          </div>
          <button
            type="button"
            className="pro-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="pro-modal-body">
          <div className="section-label" style={{ marginBottom: '6px' }}>CAPACITY EXPANSION</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Pro Features in Active Development
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.5 }}>
            The Pro subscription tier is currently in engineering and will unlock advanced frequency and high-volume circular tracking.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <IconFileText size={16} style={{ color: 'var(--brand-primary)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Unlimited Watchlists</strong>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Expand beyond the 5-topic preview limit to monitor unlimited public notices, exams, and court cases.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <IconZap size={16} style={{ color: 'var(--brand-primary)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>High-Frequency 15-Minute Sync</strong>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  High-frequency SerpApi ingestion with dedicated API capacity and zero cooldown intervals.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <IconRadio size={16} style={{ color: 'var(--brand-primary)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Webhook &amp; Dispatch Integrations</strong>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Direct payload dispatch to Discord, Slack, and internal government circular aggregators.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <IconSparkles size={16} style={{ color: 'var(--brand-primary)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Gemini AI Executive Memos</strong>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Multi-source synthesis with automated executive memos and cross-topic trend analysis.
                </p>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '18px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            All core monitoring, timeline diffing, urgency radars, and email alerts remain <strong>100% free and fully functional</strong> during this evaluation period.
          </div>

          <button
            type="button"
            className="button button-primary"
            style={{ width: '100%' }}
            onClick={onClose}
          >
            Acknowledge &amp; Continue
          </button>
        </div>
      </div>
    </div>
  );
}
