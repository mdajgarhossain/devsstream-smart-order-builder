import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../api/client';
import { serverNow } from '../../api/serverTime';
import type { Menu } from '../../domain/types';
import { askAssistant, type ChatModel } from './assistant';
import { describeAssistantError, MISSING_KEY_MESSAGE } from './gemini';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
  tools?: string[];
}

interface ChatPanelProps {
  menu: Menu;
  /** null when no API key is configured. */
  model: ChatModel | null;
}

/** Sales assistant for shop staff. Numbers come from our stats functions; Gemini only phrases them. */
export function ChatPanel({ menu, model }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);

  const couponCode = menu.promotions.find((p) => p.type === 'coupon')?.code;
  const suggestions = [
    'How many orders do we have?',
    'What is the total revenue?',
    'What is the best-selling option?',
    'Revenue by payment method?',
    'What is the average order value?',
    couponCode ? `How many orders actually got the ${couponCode} discount?` : 'How many orders got a coupon?',
    'Which orders were placed today?',
    'Who is our best customer?',
  ];

  const push = (message: Omit<Message, 'id'>) => setMessages((list) => [...list, { ...message, id: nextId.current++ }]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    push({ role: 'user', text: trimmed });
    setDraft('');
    if (!model) {
      push({ role: 'error', text: MISSING_KEY_MESSAGE });
      return;
    }
    setBusy(true);
    try {
      const answer = await askAssistant(trimmed, {
        model,
        menu,
        now: serverNow,
        loadOrders: async () => (await api.getOrders()).orders,
      });
      push({ role: 'assistant', text: answer.text, tools: answer.toolCalls.map((c) => c.name) });
    } catch (error) {
      push({ role: 'error', text: describeAssistantError(error).message });
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <section className="chat" aria-label="Sales assistant">
      <h2>Sales assistant</h2>
      <p className="muted">Ask about sales in plain English (Bangla works too). Answers are computed from the orders, not by the AI.</p>
      {!model && (
        <p role="alert" className="error">
          {MISSING_KEY_MESSAGE}
        </p>
      )}

      <ol className="chat-log" aria-label="Conversation" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className={`chat-msg ${m.role}`} role={m.role === 'error' ? 'alert' : undefined}>
            <span className="chat-text">{formatAnswer(m.text)}</span>
            {m.tools && m.tools.length > 0 && <span className="muted chat-tools">from {m.tools.join(', ')}</span>}
          </li>
        ))}
        {busy && <li className="chat-msg assistant muted">Thinking…</li>}
      </ol>

      <div className="suggestions">
        {suggestions.map((q) => (
          <button key={q} type="button" disabled={busy} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>

      <form className="chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-input">
          Your question
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. What was the revenue on 21 November?"
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={busy || draft.trim() === ''}>
          Ask
        </button>
      </form>
    </section>
  );
}

/** Gemini sometimes uses **bold**; show it as bold instead of asterisks. Everything else is plain text. */
function formatAnswer(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
