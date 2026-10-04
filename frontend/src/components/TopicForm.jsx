import React, { useState } from 'react';
import { parseMonitorIntent } from '../api/client.js';
import {
  IconSparkles,
  IconSliders,
  IconCheck,
  IconPlus,
} from './Icons.jsx';

const QUICK_PROMPTS = [
  'Monitor GATE 2027. I care about application deadlines, eligibility and exam dates.',
  'Track PM-KISAN 19th installment eligibility criteria and disbursement date.',
  'Monitor UPSC CSE 2026 prelims notification, age limit, and vacancies.',
];

export default function TopicForm({ onCreate }) {
  const [mode, setMode] = useState('ai'); // 'ai' | 'manual'
  const [promptText, setPromptText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedIntent, setExtractedIntent] = useState(null);

  // Manual fields
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('exam');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleAnalyze(e) {
    if (e) e.preventDefault();
    if (!promptText.trim()) return;
    setAnalyzing(true);
    setError('');
    try {
      const intent = await parseMonitorIntent(promptText.trim());
      setExtractedIntent(intent);
      // Pre-fill manual fields in case user wants to tweak
      setName(intent.name || '');
      setQuery(intent.query || '');
      setCategory(intent.category || 'exam');
    } catch (err) {
      setError(err.message || 'Failed to parse natural language intent. Try the manual fields.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirmCreate() {
    if (!extractedIntent) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({
        name: extractedIntent.name,
        query: extractedIntent.query,
        category: extractedIntent.category,
      });
      setPromptText('');
      setExtractedIntent(null);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onCreate({ name: name.trim(), query: query.trim(), category });
      setName('');
      setQuery('');
      setPromptText('');
      setExtractedIntent(null);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="topic-form-container">
      <div className="section-label">NEW MONITOR</div>

      <div className="form-mode-switch" role="tablist">
        <button
          type="button"
          className={`mode-btn ${mode === 'ai' ? 'is-active' : ''}`}
          onClick={() => { setMode('ai'); setError(''); }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <IconSparkles size={12} />
            <span>AI Intent</span>
          </span>
        </button>
        <button
          type="button"
          className={`mode-btn ${mode === 'manual' ? 'is-active' : ''}`}
          onClick={() => { setMode('manual'); setError(''); }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <IconSliders size={12} />
            <span>Manual</span>
          </span>
        </button>
      </div>

      {mode === 'ai' ? (
        <div className="ai-intent-form">
          {!extractedIntent ? (
            <form onSubmit={handleAnalyze}>
              <label htmlFor="nl-prompt" className="form-sublabel">
                Describe target update or circular:
              </label>
              <textarea
                id="nl-prompt"
                className="nl-prompt-input"
                rows={3}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. Monitor GATE 2027. I care about application deadlines, eligibility and exam dates."
                required
              />

              <div className="quick-prompt-chips">
                <span className="chips-label">Sample queries:</span>
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    type="button"
                    className="quick-chip"
                    onClick={() => { setPromptText(qp); setError(''); }}
                  >
                    {qp.split('.')[0]}…
                  </button>
                ))}
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}

              <button
                className="button button-primary form-action-btn"
                disabled={analyzing || !promptText.trim()}
                type="submit"
              >
                <IconSparkles size={14} />
                <span>{analyzing ? 'Analyzing Intent…' : 'Extract Intent'}</span>
              </button>
            </form>
          ) : (
            <div className="intent-preview-card">
              <div className="intent-preview-header">
                <span className="intent-badge">
                  <IconCheck size={12} style={{ marginRight: '3px' }} />
                  INTENT VERIFIED
                </span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setExtractedIntent(null)}
                  style={{ fontSize: '11px' }}
                >
                  Edit prompt
                </button>
              </div>

              <div className="intent-field">
                <span className="intent-label">TOPIC</span>
                <div className="intent-topic-name">{extractedIntent.name}</div>
              </div>

              <div className="intent-field">
                <span className="intent-label">CATEGORY</span>
                <div className="intent-category-tag">{extractedIntent.category}</div>
              </div>

              {Array.isArray(extractedIntent.watchFocus) && (
                <div className="intent-field">
                  <span className="intent-label">MONITORING FOCUS</span>
                  <ul className="intent-checklist">
                    {extractedIntent.watchFocus.map((item, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <IconCheck size={11} style={{ color: 'var(--status-verified-dot)' }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(extractedIntent.suggestedSources) && (
                <div className="intent-field">
                  <span className="intent-label">PORTAL TARGETS</span>
                  <ul className="intent-checklist">
                    {extractedIntent.suggestedSources.map((src, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <IconCheck size={11} style={{ color: 'var(--status-verified-dot)' }} />
                        <span>{src}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="intent-field intent-query-preview">
                <span className="intent-label">TARGET QUERY</span>
                <code>{extractedIntent.query}</code>
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}

              <div className="intent-action-row">
                <button
                  type="button"
                  className="button button-primary form-action-btn"
                  disabled={busy}
                  onClick={handleConfirmCreate}
                >
                  <IconPlus size={14} />
                  <span>{busy ? 'Setting up…' : 'Start Monitoring'}</span>
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => { setMode('manual'); setExtractedIntent(null); }}
                  style={{ fontSize: '12px', padding: '6px 10px' }}
                >
                  Edit form
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form className="topic-form" onSubmit={handleManualSubmit}>
          <label htmlFor="topic-name">Topic name</label>
          <input
            id="topic-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            placeholder="e.g. GATE 2027"
            required
          />
          <label htmlFor="topic-query">Search query</label>
          <input
            id="topic-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={500}
            placeholder="e.g. GATE 2027 application deadline eligibility"
            required
          />
          <label htmlFor="topic-category">Category</label>
          <select
            id="topic-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="exam">Competitive exam</option>
            <option value="scheme">Government scheme</option>
            <option value="recruitment">Job / Recruitment</option>
            <option value="case">Court case / Legal</option>
            <option value="policy">Public policy / Rule</option>
            <option value="admission">University admission</option>
            <option value="other">Other</option>
          </select>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary form-action-btn" disabled={busy} type="submit">
            <IconPlus size={14} />
            <span>{busy ? 'Saving topic…' : 'Track this topic'}</span>
          </button>
        </form>
      )}
    </div>
  );
}
