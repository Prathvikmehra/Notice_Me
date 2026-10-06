import React, { useState, useRef, useEffect } from 'react';
import { askMonitoredChat } from '../api/client.js';
import {
  IconSparkles,
  IconX,
  IconSend,
  IconExternalLink,
  IconUser,
  IconShield,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconFileText,
} from './Icons.jsx';

function renderChatMessage(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let currentList = null;

  function parseInline(str) {
    if (!str) return '';
    const parts = [];
    const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s)\]]+|\*\*([^*]+)\*\*|`([^`]+)`|\[(CRITICAL|HIGH IMPACT|MEDIUM IMPACT|LOW IMPACT|HIGH|MEDIUM|LOW|OFFICIAL|KEY DATE|BEFORE|AFTER|PREVIOUS STATE|VERIFIED UPDATE)\])/g;
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
      } else if (match[6]) {
        const badgeType = match[6].toLowerCase().replace(/\s+/g, '-');
        parts.push(
          <span key={key++} className={`chat-badge-pill badge-${badgeType}`}>
            {match[6]}
          </span>
        );
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

    if (trimmed.startsWith('> ')) {
      if (currentList) {
        elements.push(<ul key={`ul-${idx}`} className="chat-bullet-list">{currentList}</ul>);
        currentList = null;
      }
      const quote = trimmed.slice(2);
      elements.push(<blockquote key={`quote-${idx}`} className="chat-quote">{parseInline(quote)}</blockquote>);
      return;
    }

    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.replace(/^[•\-*]\s*/, '');
      if (!currentList) currentList = [];
      currentList.push(<li key={`li-${idx}`}>{parseInline(itemText)}</li>);
      return;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      if (!currentList) currentList = [];
      currentList.push(<li key={`li-${idx}`} value={Number(numMatch[1])}>{parseInline(numMatch[2])}</li>);
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
  const [selectedTopicId, setSelectedTopicId] = useState(activeTopic?.id || 'all');

  useEffect(() => {
    if (activeTopic?.id) {
      setSelectedTopicId(activeTopic.id);
    } else {
      setSelectedTopicId('all');
    }
  }, [activeTopic, isOpen]);

  const effectiveTopic = selectedTopicId === 'all'
    ? null
    : (topics.find((t) => t.id === selectedTopicId) || activeTopic);

  const buildInitialGreeting = (topicObj) => ({
    role: 'assistant',
    text: topicObj
      ? `Hello! I am your Notice Me AI Intelligence Analyst. Ask me anything about verified circulars, timeline shifts, or official source citations for **${topicObj.name}**.`
      : `Hello! I am your Notice Me AI Intelligence Analyst. Ask me anything about recent shifts, deadlines, or official notices across your monitored topics.`,
    sources: [],
    suggestedFollowUps: topicObj
      ? [
          `What is the latest verified status of ${topicObj.name}?`,
          `Did any application deadlines or dates change?`,
          `What practical actions are required for ${topicObj.name}?`,
        ]
      : [
          'What changed this week across my watchlist?',
          'Which detected updates have HIGH impact?',
          'Did any application deadlines change recently?',
          'Give me an executive briefing of all notices.',
        ],
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  const [messages, setMessages] = useState(() => [buildInitialGreeting(activeTopic)]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const messagesEndRef = useRef(null);

  const sampleQuestions = effectiveTopic
    ? [
        `What is the latest status of ${effectiveTopic.name}?`,
        `Did any application deadlines or dates change?`,
        `What actions are required for ${effectiveTopic.name}?`,
        `Show verified official source citations.`,
      ]
    : [
        'What changed this week across my watchlist?',
        'Which detected updates have HIGH impact?',
        'Did any application deadlines or exam dates change?',
        'Summarize the current status of my watchlist.',
      ];

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleScopeChange = (newId) => {
    setSelectedTopicId(newId);
    const newTopic = newId === 'all' ? null : topics.find((t) => t.id === newId);
    setMessages([buildInitialGreeting(newTopic)]);
  };

  const handleClearChat = () => {
    setMessages([buildInitialGreeting(effectiveTopic)]);
  };

  const handleCopyMessage = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {}
  };

  const handleCopyTranscript = async () => {
    try {
      const transcript = messages
        .map((m) => `[${m.role.toUpperCase()} - ${m.timestamp}]\n${m.text}\n`)
        .join('\n---\n\n');
      await navigator.clipboard.writeText(transcript);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {}
  };

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
        topicId: effectiveTopic?.id || null,
        history: historyPayload,
      });

      const assistantMsg = {
        role: 'assistant',
        text: res.answer || 'No response returned from analyst.',
        sources: res.sources || [],
        suggestedFollowUps: res.suggestedFollowUps || [],
        grounded: res.grounded !== false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        text: `Error querying monitored intelligence: ${err.message}`,
        sources: [],
        suggestedFollowUps: [],
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3>AI Intelligence Analyst</h3>
                <span className="chat-model-badge">VERIFIED RADAR</span>
              </div>
              <div className="chat-scope-bar">
                <span className="chat-scope-label">Focus:</span>
                <select
                  className="chat-scope-select"
                  value={selectedTopicId}
                  onChange={(e) => handleScopeChange(e.target.value)}
                  disabled={loading}
                >
                  <option value="all">All Monitored Topics ({topics.length})</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className="chat-tool-btn"
              onClick={handleCopyTranscript}
              title="Copy entire chat transcript"
            >
              {copiedTranscript ? <IconCheck size={13} /> : <IconFileText size={13} />}
              <span>{copiedTranscript ? 'Copied' : 'Export'}</span>
            </button>
            <button
              type="button"
              className="chat-tool-btn"
              onClick={handleClearChat}
              title="Reset conversation"
              disabled={loading || messages.length <= 1}
            >
              <IconRefresh size={13} />
              <span>Reset</span>
            </button>
            <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close chat">
              <IconX size={16} />
            </button>
          </div>
        </header>

        <div className="chat-grounding-banner">
          <IconShield size={13} style={{ color: 'var(--status-verified-dot)', flexShrink: 0 }} />
          <span>Strictly grounded: Answers synthesize verified official circulars, gazettes, and crawler diffs. Zero hallucinations.</span>
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
                    <span className="chat-sources-label">Verified Citations:</span>
                    <div className="chat-sources-chips">
                      {msg.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chat-source-chip"
                          title={s.url}
                        >
                          <span>{s.domain || 'Source'}</span>
                          <IconExternalLink size={10} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {msg.role === 'assistant' && msg.suggestedFollowUps?.length > 0 && (
                  <div className="chat-followups-inline">
                    <span className="chat-followups-label">Suggested follow-ups:</span>
                    <div className="chat-followups-list">
                      {msg.suggestedFollowUps.map((fu, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          className="chat-followup-pill"
                          onClick={() => handleSend(fu)}
                          disabled={loading}
                        >
                          <span>{fu}</span>
                          <span aria-hidden="true">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="chat-bubble-footer">
                  {msg.role === 'assistant' && (
                    <button
                      type="button"
                      className="chat-copy-msg-btn"
                      onClick={() => handleCopyMessage(msg.text, i)}
                      title="Copy response"
                    >
                      {copiedIdx === i ? <IconCheck size={11} /> : <IconCopy size={11} />}
                      <span>{copiedIdx === i ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                  <span className="chat-timestamp">{msg.timestamp}</span>
                </div>
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
                  Analyzing verified snapshots & official citations…
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-quick-suggestions">
          <span className="quick-label">Prompt Starters:</span>
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
            placeholder={effectiveTopic ? `Ask about ${effectiveTopic.name}…` : 'Ask anything about your monitored topics…'}
            disabled={loading}
            autoFocus
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
