import React, { useState, useRef, useEffect } from 'react';
import { askMonitoredChat } from '../api/client.js';
import {
  IconSparkles,
  IconX,
  IconSend,
  IconExternalLink,
  IconUser,
  IconShield,
} from './Icons.jsx';

function renderChatMessage(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let currentList = null;

  function parseInline(str) {
    if (!str) return '';
    const parts = [];
    const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s)\]]+|\*\*([^*]+)\*\*|`([^`]+)`)/g;
    let lastIdx = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIdx) {
        parts.push(str.slice(lastIdx, match.index));
      }
      if (match[2] && match[3]) {
        parts.push(
          <a key={key++} href={match[3]} target="_blank" rel="noopener noreferrer" className="chat-inline-link">
            {match[2]} ↗
          </a>
        );
      } else if (match[0].startsWith('http')) {
        parts.push(
          <a key={key++} href={match[0]} target="_blank" rel="noopener noreferrer" className="chat-inline-link">
            {match[0].length > 35 ? match[0].slice(0, 35) + '…' : match[0]} ↗
          </a>
        );
      } else if (match[4]) {
        parts.push(<strong key={key++}>{match[4]}</strong>);
      } else if (match[5]) {
        parts.push(<code key={key++} className="chat-inline-code">{match[5]}</code>);
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < str.length) {
      parts.push(str.slice(lastIdx));
    }
    return parts.length > 0 ? parts : str;
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentList) {
        elements.push(<ul key={`ul-${idx}`} className="chat-bullet-list">{currentList}</ul>);
        currentList = null;
      }
      return;
    }

    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      if (currentList) {
        elements.push(<ul key={`ul-${idx}`} className="chat-bullet-list">{currentList}</ul>);
        currentList = null;
      }
      const title = trimmed.replace(/^#+\s*/, '');
      elements.push(<h4 key={`h-${idx}`} className="chat-msg-heading">{parseInline(title)}</h4>);
      return;
    }

    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.replace(/^[•\-*]\s*/, '');
      if (!currentList) currentList = [];
      currentList.push(<li key={`li-${idx}`}>{parseInline(itemText)}</li>);
      return;
    }

    if (currentList) {
      elements.push(<ul key={`ul-${idx}`} className="chat-bullet-list">{currentList}</ul>);
      currentList = null;
    }

    elements.push(<p key={`p-${idx}`} className="chat-msg-para">{parseInline(line)}</p>);
  });

  if (currentList) {
    elements.push(<ul key={`ul-end`} className="chat-bullet-list">{currentList}</ul>);
  }

  return elements;
}

export default function AIChatModal({ isOpen, onClose, activeTopic = null, topics = [] }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: activeTopic
        ? `Hello! I am your Notice Me AI Analyst. Ask me anything about changes, deadlines, or official source evidence for **${activeTopic.name}**.`
        : `Hello! I am your Notice Me AI Analyst. Ask me anything about recent shifts, deadlines, or official notices across your monitored topics.`,
      sources: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const sampleQuestions = activeTopic
    ? [
        `What is the latest status of ${activeTopic.name}?`,
        `Did any application deadlines or dates change?`,
        `What actions are required for ${activeTopic.name}?`,
        `Show me the latest official source updates.`,
      ]
    : [
        'What changed this week across my topics?',
        'Which detected changes are High Impact?',
        'Did any application deadlines or exam dates change?',
        'Summarize the latest status of my watchlist.',
      ];

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

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = newMessages.slice(1, -1).slice(-6).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await askMonitoredChat({
        question: q,
        topicId: activeTopic?.id || null,
        history: historyPayload,
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
            <span className="chat-bot-icon">
              <IconSparkles size={16} />
            </span>
            <div>
              <h3>AI Intelligence Analyst</h3>
              <p className="chat-sub">
                {activeTopic ? `Focused on: ${activeTopic.name}` : `Querying across ${topics.length} monitored topics`}
              </p>
            </div>
          </div>
          <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close chat">
            <IconX size={16} />
          </button>
        </header>

        <div className="chat-grounding-banner">
          <IconShield size={13} style={{ color: 'var(--status-verified-dot)', flexShrink: 0 }} />
          <span>Strictly grounded: Answers only from verified database snapshots and diffs. Zero hallucinations.</span>
        </div>

        <div className="chat-messages-scroll">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message-row is-${msg.role}`}>
              <div className="chat-avatar">
                {msg.role === 'assistant' ? <IconSparkles size={13} /> : <IconUser size={13} />}
              </div>
              <div className="chat-bubble">
                <div className="chat-bubble-text">
                  {renderChatMessage(msg.text)}
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
                          <span>{s.domain || 'Source'}</span>
                          <IconExternalLink size={10} />
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
              <div className="chat-avatar"><IconSparkles size={13} /></div>
              <div className="chat-bubble is-loading">
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span style={{ marginLeft: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Analyzing verified snapshots…
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-quick-suggestions">
          <span className="quick-label">Suggested:</span>
          {sampleQuestions.map((sq, idx) => (
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
            <IconSend size={13} />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
