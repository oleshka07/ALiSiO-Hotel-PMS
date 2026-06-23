'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
};

const SUGGESTIONS = [
  'Які сьогодні прибуття?',
  'Скільки бронювань за цей місяць?',
  'Які гості ще не заплатили?',
  'Яка виручка за цей рік?',
  'Скільки вільних номерів зараз?',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    setInput('');
    setLoading(true);

    // Add user message
    const userMsg: Message = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);

    // Add placeholder for streaming assistant message
    const assistantMsgIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    // Build history (exclude the placeholder we just added)
    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Невідома помилка' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });

          // Update the streaming message
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantMsgIndex] = {
              role: 'assistant',
              content: accumulated,
              isStreaming: true,
            };
            return updated;
          });
        }
      }

      // Mark streaming done
      setMessages(prev => {
        const updated = [...prev];
        if (updated[assistantMsgIndex]) {
          updated[assistantMsgIndex] = {
            role: 'assistant',
            content: accumulated || 'Немає відповіді.',
            isStreaming: false,
          };
        }
        return updated;
      });

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const errMsg = err instanceof Error ? err.message : 'Сталася помилка';
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantMsgIndex] = {
          role: 'assistant',
          content: `⚠️ ${errMsg}`,
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setLoading(false);
  }

  // Render markdown-like text (basic: bold, code blocks, tables)
  function renderContent(text: string) {
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
        return (
          <pre key={i} style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            padding: '8px 12px',
            overflowX: 'auto',
            fontSize: 12,
            lineHeight: 1.5,
            margin: '4px 0',
          }}>
            <code>{code}</code>
          </pre>
        );
      }
      // Process inline: bold, inline code, line breaks
      return (
        <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
          {part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((seg, j) => {
            if (seg.startsWith('**') && seg.endsWith('**')) {
              return <strong key={j}>{seg.slice(2, -2)}</strong>;
            }
            if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
              return (
                <code key={j} style={{
                  background: 'var(--bg-secondary)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontSize: '0.9em',
                  fontFamily: 'monospace',
                }}>
                  {seg.slice(1, -1)}
                </code>
              );
            }
            return <span key={j}>{seg}</span>;
          })}
        </span>
      );
    });
  }

  return (
    <>
      {/* Floating button */}
      <button
        className="ai-chat-btn"
        onClick={() => setOpen(o => !o)}
        title="AI Асистент (Ctrl+K)"
        style={{
          position: 'fixed',
          bottom: 100,
          right: 24,
          zIndex: 1000,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: open ? 'var(--color-primary, #6366f1)' : 'var(--color-primary, #6366f1)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          fontSize: 22,
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {open ? '✕' : '✦'}
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="ai-chat-panel" style={{
          position: 'fixed',
          bottom: 164,
          right: 24,
          zIndex: 999,
          width: 420,
          maxWidth: 'calc(100vw - 48px)',
          height: 560,
          maxHeight: 'calc(100vh - 120px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-primary, #fff)',
          border: '1px solid var(--border-primary, #e5e7eb)',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg-primary)',
          }}>
            <span style={{ fontSize: 20 }}>✦</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                ALiSiO AI
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Запитуй про бронювання, гостей, фінанси
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Очистити чат"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  fontSize: 12,
                  padding: '4px 8px',
                  borderRadius: 6,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Очистити
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {messages.length === 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Привіт! Я можу відповідати на питання про твої дані у реальному часі.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      style={{
                        textAlign: 'left',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: msg.role === 'user' ? 'var(--color-primary, #6366f1)' : 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: msg.role === 'user' ? 12 : 14,
                  flexShrink: 0,
                  color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
                }}>
                  {msg.role === 'user' ? 'Я' : '✦'}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: '80%',
                  background: msg.role === 'user'
                    ? 'var(--color-primary, #6366f1)'
                    : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: msg.role === 'assistant' ? '1px solid var(--border-primary)' : 'none',
                }}>
                  {msg.content ? renderContent(msg.content) : null}
                  {msg.isStreaming && (
                    <span style={{
                      display: 'inline-block',
                      width: 6,
                      height: 14,
                      background: 'currentColor',
                      marginLeft: 2,
                      verticalAlign: 'text-bottom',
                      animation: 'blink 1s step-end infinite',
                    }} />
                  )}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-primary)',
            background: 'var(--bg-primary)',
          }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Запитай про дані... (Enter — надіслати)"
                rows={1}
                disabled={loading}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  lineHeight: 1.5,
                  maxHeight: 100,
                  overflowY: 'auto',
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                style={{
                  background: 'var(--color-primary, #6366f1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '0 14px',
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  opacity: !input.trim() || loading ? 0.5 : 1,
                  fontSize: 18,
                  transition: 'opacity 0.15s',
                  flexShrink: 0,
                }}
              >
                {loading ? '⏳' : '↑'}
              </button>
            </form>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 5, textAlign: 'center' }}>
              Ctrl+K — відкрити/закрити · Shift+Enter — новий рядок
            </div>
          </div>
        </div>
      )}

      {/* Cursor blink + mobile positioning */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        /* On mobile: move button above bottom nav (~68px) + safe area */
        @media (max-width: 768px) {
          .ai-chat-btn {
            bottom: calc(102px + env(safe-area-inset-bottom)) !important;
            right: 16px !important;
          }
          .ai-chat-panel {
            bottom: calc(166px + env(safe-area-inset-bottom)) !important;
            right: 16px !important;
            left: 16px !important;
            width: auto !important;
            max-width: 100% !important;
          }
        }
        @media (max-width: 480px) {
          .ai-chat-panel {
            top: 0 !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            border-radius: 0 !important;
            max-height: 100% !important;
            height: 100% !important;
          }
          .ai-chat-btn {
            bottom: calc(102px + env(safe-area-inset-bottom)) !important;
            right: 16px !important;
          }
        }
      `}</style>
    </>
  );
}
