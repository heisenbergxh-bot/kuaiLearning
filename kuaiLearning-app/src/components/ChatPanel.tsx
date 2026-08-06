import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n/useTranslation';
import { chatWithAI } from '../ai/client';
import { db, generateId } from '../db';
import type { ChatMessage } from '../types';

interface ChatPanelProps {
  lessonId: string;
}

export function ChatPanel({ lessonId }: ChatPanelProps) {
  const { settings } = useSettingsStore();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    // Scroll only the chat container to its bottom — NOT scrollIntoView, which
    // would also scroll the whole page down on entry. Skip when there are no
    // messages so opening a lesson keeps the page at the top.
    if (messages.length === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadMessages = useCallback(async () => {
    const msgs = await db.chatMessages
      .where('lessonId')
      .equals(lessonId)
      .sortBy('createdAt');
    setMessages(msgs);
  }, [lessonId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !settings.apiKey) return;

    setInput('');
    setError('');

    const userMsg: ChatMessage = {
      id: generateId(),
      lessonId,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };

    await db.chatMessages.add(userMsg);
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const reply = await chatWithAI(settings, lessonId, messages, text);

      const assistantMsg: ChatMessage = {
        id: generateId(),
        lessonId,
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
      };

      await db.chatMessages.add(assistantMsg);
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(err.message || 'Failed to get response');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    if (confirm(t('clearChatConfirm'))) {
      await db.chatMessages.where('lessonId').equals(lessonId).delete();
      setMessages([]);
    }
  };

  return (
    <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-accent-light)]/30">
        <h3 className="text-sm font-semibold text-[var(--color-text-heading)]">
          💬 {t('chatTitle')}
        </h3>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
          >
            {t('clearChat')}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="h-64 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-2xl mb-2">🤔</p>
            <p className="text-sm text-[var(--color-text-muted)] mb-1">{t('chatEmpty')}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{t('chatEmptyHint')}</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--color-accent)] text-white rounded-br-md'
                  : 'bg-[var(--color-accent-light)]/50 text-[var(--color-text)] rounded-bl-md border border-[var(--color-border)]'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-[var(--color-accent-light)]/50 text-[var(--color-text)] border border-[var(--color-border)]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] px-3 py-2.5 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chatPlaceholder')}
          disabled={sending || !settings.apiKey}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim() || !settings.apiKey}
          className="px-4 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? '...' : t('send')}
        </button>
      </div>

      {!settings.apiKey && (
        <div className="px-3 pb-2">
          <p className="text-xs text-[var(--color-warning)]">{t('genNoApiKey')}</p>
        </div>
      )}
    </div>
  );
}
