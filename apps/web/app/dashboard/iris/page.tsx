'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Sparkles, Send } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export default function IrisPage() {
  const api = useApi();
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = useQuery({
    queryKey: ['iris', 'suggestions'],
    queryFn: () => api.get<string[]>('/iris/suggestions'),
  });

  const send = useMutation({
    mutationFn: (text: string) =>
      api.post<{ reply: string }>('/iris/chat', { message: text, history: messages }),
    onSuccess: (res) => setMessages((m) => [...m, { role: 'assistant', content: res.reply }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, send.isPending]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    send.mutate(trimmed);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-2xl flex-col">
      <div className="flex items-center gap-2 pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-nexo-teal/15 text-nexo-teal">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Iris IA</h1>
          <p className="text-xs text-nexo-muted">Tu asistente con datos reales del conjunto</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && !send.isPending ? (
          <div className="space-y-3 pt-6">
            <p className="text-center text-sm text-nexo-muted">¿En qué te puedo ayudar hoy?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(suggestions.data ?? []).map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-nexo-border bg-nexo-surface px-3 py-1.5 text-sm text-nexo-text transition-colors hover:border-nexo-teal hover:text-nexo-teal"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-nexo-navy px-4 py-2.5 text-sm text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nexo-teal/15 text-nexo-teal">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-nexo-surface px-4 py-2.5 text-sm shadow-sm">
                {m.content}
              </div>
            </div>
          ),
        )}

        {send.isPending ? (
          <div className="flex gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nexo-teal/15 text-nexo-teal">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-nexo-surface px-4 py-3 shadow-sm">
              <span className="text-xs text-nexo-muted">Iris está escribiendo</span>
              <Dots />
            </div>
          </div>
        ) : null}

        {send.isError ? (
          <p className="text-center text-sm text-red-600">{(send.error as Error).message}</p>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="mt-4 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          className="flex-1 rounded-xl border border-nexo-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
        />
        <Button type="submit" variant="accent" size="icon" disabled={!input.trim() || send.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function Dots() {
  return (
    <span className="flex gap-0.5">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-nexo-teal"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}
