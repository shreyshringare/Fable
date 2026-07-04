import { FormEvent, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { formatMoney } from '../lib/currency';
import { useTripStore } from '../store/trip';
import type { Reservation } from '../types';
import Modal from './Modal';

const TYPE_STYLE: Record<Reservation['type'], { icon: string; color: string; label: string }> = {
  flight: { icon: '✈️', color: 'border-sky-400 bg-sky-50 dark:bg-sky-900/20', label: 'Flight' },
  accommodation: { icon: '🏨', color: 'border-violet-400 bg-violet-50 dark:bg-violet-900/20', label: 'Stay' },
  restaurant: { icon: '🍽️', color: 'border-rose-400 bg-rose-50 dark:bg-rose-900/20', label: 'Dining' },
  transport: { icon: '🚆', color: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20', label: 'Transport' },
};

export default function ReservationsTab({ canEdit }: { canEdit: boolean }) {
  const { reservations, tripId } = useTripStore();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    type: 'flight',
    title: '',
    confirmation_number: '',
    start_datetime: '',
    end_datetime: '',
    status: 'confirmed',
    cost: '',
    notes: '',
  });

  const sorted = useMemo(
    () =>
      [...reservations].sort((a, b) =>
        (a.start_datetime ?? '9999').localeCompare(b.start_datetime ?? '9999'),
      ),
    [reservations],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    await api.post(`/trips/${tripId}/reservations`, {
      type: form.type,
      title: form.title,
      confirmation_number: form.confirmation_number || undefined,
      start_datetime: form.start_datetime || undefined,
      end_datetime: form.end_datetime || undefined,
      status: form.status,
      cost: form.cost ? Number(form.cost) : undefined,
      notes: form.notes || undefined,
    });
    setShowAdd(false);
    setForm({ ...form, title: '', confirmation_number: '', start_datetime: '', end_datetime: '', cost: '', notes: '' });
  }

  async function remove(id: string) {
    await api.delete(`/trips/${tripId}/reservations/${id}`);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Reservations</h2>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + Add reservation
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="card flex flex-col items-center py-14 text-center">
          <div className="text-5xl">🎫</div>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No reservations yet. Flights, stays, dinners — keep confirmations in one place.
          </p>
        </div>
      ) : (
        <div className="relative space-y-3 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-700">
          {sorted.map((r) => {
            const style = TYPE_STYLE[r.type];
            return (
              <div key={r.id} className={`card relative border-l-4 p-4 ${style.color}`}>
                <span className="absolute -left-[26px] top-4 h-3 w-3 rounded-full bg-indigo-600 ring-4 ring-gray-50 dark:ring-gray-900" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg">{style.icon}</span>
                      <h3 className="font-semibold">{r.title}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === 'confirmed'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                            : r.status === 'pending'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {r.start_datetime &&
                        format(new Date(r.start_datetime), 'EEE, MMM d · HH:mm')}
                      {r.end_datetime &&
                        ` → ${format(new Date(r.end_datetime), 'EEE, MMM d · HH:mm')}`}
                    </p>
                    {r.confirmation_number && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Confirmation: <span className="font-mono">{r.confirmation_number}</span>
                      </p>
                    )}
                    {r.notes && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {r.cost != null && <span className="font-bold">{formatMoney(r.cost)}</span>}
                    {canEdit && (
                      <button
                        onClick={() => remove(r.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Add reservation" onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type</label>
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {Object.entries(TYPE_STYLE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.icon} {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="LH 761 FRA → BLR"
                required
              />
            </div>
            <div>
              <label className="label">Confirmation number</label>
              <input
                className="input"
                value={form.confirmation_number}
                onChange={(e) => setForm({ ...form, confirmation_number: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={form.start_datetime}
                  onChange={(e) => setForm({ ...form, start_datetime: e.target.value })}
                />
              </div>
              <div>
                <label className="label">End</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={form.end_datetime}
                  onChange={(e) => setForm({ ...form, end_datetime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Cost (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button className="btn-primary">Add</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
