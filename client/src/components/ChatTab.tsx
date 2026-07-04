import { FormEvent, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { socket } from '../lib/ws';
import { useAuthStore } from '../store/auth';
import { useTripStore } from '../store/trip';
import Avatar from './Avatar';

const TYPING_VISIBLE_MS = 3000;
const TYPING_THROTTLE_MS = 1500;

export default function ChatTab({ canEdit }: { canEdit: boolean }) {
  const { messages, tripId, typing } = useTripStore();
  const user = useAuthStore((s) => s.user);
  const [text, setText] = useState('');
  const [, tick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-render every second so the typing indicator expires on time.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const showTyping =
    typing &&
    typing.userId !== user?.id &&
    Date.now() - typing.at < TYPING_VISIBLE_MS;

  function onType(value: string) {
    setText(value);
    if (!tripId) return;
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      socket.sendTyping(tripId);
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !tripId) return;
    socket.sendMessage(tripId, text.trim());
    setText('');
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto flex h-[70vh] max-w-3xl flex-col">
      <div className="card flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="text-5xl">💬</div>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Plan out loud. Messages sync live for everyone on the trip.
            </p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <Avatar name={m.user_name ?? '?'} url={m.user_avatar} size={30} />
              <div className={`max-w-[75%] ${mine ? 'text-right' : ''}`}>
                <div
                  className={`inline-block rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? 'rounded-tr-sm bg-indigo-600 text-white'
                      : 'rounded-tl-sm bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  {m.content}
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {!mine && `${m.user_name} · `}
                  {format(new Date(m.created_at.replace(' ', 'T') + 'Z'), 'MMM d, HH:mm')}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="h-5 px-1 pt-1 text-xs text-gray-400">
        {showTyping && (
          <span className="fade-in inline-flex items-center gap-1">
            <span className="typing-dots"><i /><i /><i /></span>
            {typing!.name} is typing…
          </span>
        )}
      </div>
      {canEdit && (
        <form onSubmit={send} className="mt-1 flex gap-2">
          <input
            ref={inputRef}
            className="input flex-1"
            placeholder="Message the crew…"
            value={text}
            onChange={(e) => onType(e.target.value)}
          />
          <button className="btn-primary" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
