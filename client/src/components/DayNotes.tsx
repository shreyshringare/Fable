import { FormEvent, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { useTripStore } from '../store/trip';

const NOTE_ICONS = ['📝', '💡', '⚠️', '🍜', '🎟️', '⏰', '💤', '📷'];

export default function DayNotes({ dayId, canEdit }: { dayId: string; canEdit: boolean }) {
  const tripId = useTripStore((s) => s.tripId);
  const notes = useTripStore((s) => s.notes);
  const [content, setContent] = useState('');
  const [icon, setIcon] = useState('📝');

  const dayNotes = useMemo(
    () => notes.filter((n) => n.day_id === dayId).sort((a, b) => a.order_index - b.order_index),
    [notes, dayId],
  );

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setContent('');
    await api.post(`/trips/${tripId}/days/${dayId}/notes`, { content: content.trim(), icon });
  }

  async function remove(noteId: string) {
    await api.delete(`/trips/${tripId}/days/${dayId}/notes/${noteId}`);
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...dayNotes];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await api.post(`/trips/${tripId}/days/${dayId}/notes/reorder`, {
      items: next.map((n, i) => ({ id: n.id, order_index: i })),
    });
  }

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Day notes
      </h3>
      <div className="space-y-2">
        {dayNotes.map((n, i) => (
          <div key={n.id} className="flex items-start gap-2 rounded-lg bg-gray-50 p-2.5 dark:bg-gray-700/50">
            <span>{n.icon ?? '📝'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{n.content}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {format(new Date(n.timestamp.replace(' ', 'T') + 'Z'), 'MMM d, HH:mm')}
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-0.5 text-gray-400">
                <button onClick={() => move(i, -1)} className="rounded p-0.5 hover:text-gray-700 dark:hover:text-gray-200" title="Move up">↑</button>
                <button onClick={() => move(i, 1)} className="rounded p-0.5 hover:text-gray-700 dark:hover:text-gray-200" title="Move down">↓</button>
                <button onClick={() => remove(n.id)} className="rounded p-0.5 hover:text-red-600" title="Delete">✕</button>
              </div>
            )}
          </div>
        ))}
        {dayNotes.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No notes for this day.</p>
        )}
      </div>
      {canEdit && (
        <form onSubmit={add} className="mt-3 flex gap-2">
          <select className="input !w-16 text-center" value={icon} onChange={(e) => setIcon(e.target.value)}>
            {NOTE_ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <input
            className="input flex-1"
            placeholder="Add a note…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <button className="btn-primary">Add</button>
        </form>
      )}
    </div>
  );
}
