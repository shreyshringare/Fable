import { FormEvent, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { socket } from '../lib/ws';
import { useAuthStore } from '../store/auth';
import { useTripStore } from '../store/trip';
import Avatar from './Avatar';

export default function ChatTab({ canEdit }: { canEdit: boolean }) {
  const { messages, tripId } = useTripStore();
  const user = useAuthStore((s) => s.user);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !tripId) return;
    socket.sendMessage(tripId, text.trim());
    setText('');
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
      {canEdit && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Message the crew…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
