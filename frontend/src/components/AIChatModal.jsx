import React, { useState, useRef, useEffect } from 'react';
import { askMonitoredChat } from '../api/client.js';

const SAMPLE_QUESTIONS = [
  'What changed this week across my topics?',
  'Which detected changes are High Impact?',
  'Did any application deadlines or exam dates change?',
  'Summarize the latest status of my watchlist.',
];

export default function AIChatModal({ isOpen, onClose, activeTopic = null, topics = [] }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: activeTopic
        ? `Hello! I am your Notice Me AI Analyst. Ask me anything about changes, deadlines, or source evidence for **${activeTopic.name}**.`
        : `Hello! I am your Notice Me AI Analyst. Ask me anything about recent shifts, deadlines, or official notices across your monitored topics.`,
      sources: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  async function handleSend(questionText = input) {
    const q = (questionText || '').trim();
    if (!q || loading) return;

    const userMsg = {
      role: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await askMonitoredChat({
        question: q,
        topicId: activeTopic?.id || null,
      });

      const assistantMsg = {
        role: 'assistant',
        text: res.answer || 'No response returned from analyst.',
        sources: res.sources || [],
        grounded: res.grounded !== false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        text: `Error querying monitored intelligence: ${err.message}`,
        sources: [],
        grounded: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="chat-modal-window" onClick={(e) => e.stopPropagation()}>
        <header className="chat-modal-header">
          <div className="chat-header-title">
            <span className="chat-bot-icon">🤖</span>
            <div>
              <h3>AI Intelligence Analyst</h3>
              <p className="chat-sub">
                {activeTopic ? `Focused on: ${activeTopic.name}` : `Querying across ${topics.length} monitored topics`}
              </p>
            </div>
          </div>
          <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        </header>

        <div className="chat-grounding-banner">
          <span className="ground-dot" />
          <span>Strictly grounded: Answers only from verified database snapshots and diffs. Zero hallucinations.</span>
        </div>

        <div className="chat-messages-scroll">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message-row is-${msg.role}`}>
              <div className="chat-avatar">{msg.role === 'assistant' ? '✳' : '👤'}</div>
              <div className="chat-bubble">
                <div className="chat-bubble-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                </div>
                {msg.sources?.length > 0 && (
                  <div className="chat-sources-block">
                    <span className="chat-sources-label">Sources Cited:</span>
                    <div className="chat-sources-chips">
                      {msg.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chat-source-chip"
                        >
                          {s.domain || 'Source'} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="chat-timestamp">{msg.timestamp}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-message-row is-assistant">
              <div className="chat-avatar">✳</div>
              <div className="chat-bubble is-loading">
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span style={{ marginLeft: '8px', fontSize: '13px', color: '#64748B' }}>
                  Analyzing verified snapshots…
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-quick-suggestions">
          <span className="quick-label">Suggested:</span>
          {SAMPLE_QUESTIONS.map((sq, idx) => (
            <button
              key={idx}
              type="button"
              className="chat-sample-btn"
              onClick={() => handleSend(sq)}
              disabled={loading}
            >
              {sq}
            </button>
          ))}
        </div>

        <form
          className="chat-input-form"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <input
            type="text"
            className="chat-input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeTopic ? `Ask about ${activeTopic.name}…` : 'Ask anything about your monitored topics…'}
            disabled={loading}
          />
          <button
            type="submit"
            className="button button-primary chat-send-btn"
            disabled={loading || !input.trim()}
          >
            Send ↗
          </button>
        </form>
      </div>
    </div>
  );
}
