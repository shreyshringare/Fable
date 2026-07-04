import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile } from '../lib/api';
import { toast } from '../store/toast';
import { useTripStore } from '../store/trip';
import type { Trip } from '../types';
import Modal from './Modal';

export default function TripSettingsModal({
  trip,
  isOwner,
  onClose,
}: {
  trip: Trip;
  isOwner: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(trip.name);
  const [description, setDescription] = useState(trip.description ?? '');
  const [startDate, setStartDate] = useState(trip.start_date ?? '');
  const [endDate, setEndDate] = useState(trip.end_date ?? '');
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (startDate && endDate && endDate < startDate) {
      toast('End date must be after start date');
      return;
    }
    setBusy(true);
    try {
      let cover_image: string | undefined;
      if (cover) cover_image = (await uploadFile('covers', cover)).url;
      const updated = await api.patch<Trip>(`/trips/${trip.id}`, {
        name,
        description: description || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        ...(cover_image ? { cover_image } : {}),
      });
      useTripStore.setState({ trip: updated });
      await useTripStore.getState().reload();
      toast('Trip updated', 'success');
      onClose();
    } catch {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/trips/${trip.id}`);
      navigate('/');
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal title="Trip settings" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Trip name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start date</label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">End date</label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Extending dates adds new days; shrinking removes only empty out-of-range days.
        </p>
        <div>
          <label className="label">Replace cover image</label>
          <input
            type="file"
            accept="image/*"
            className="input"
            onChange={(e) => setCover(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {isOwner && (
        <div className="mt-6 border-t border-red-200 pt-4 dark:border-red-900">
          <h3 className="text-sm font-bold text-red-600">Danger zone</h3>
          {confirmDelete ? (
            <div className="mt-2 flex items-center gap-2">
              <p className="flex-1 text-sm text-gray-600 dark:text-gray-300">
                Deletes the trip and everything in it. No undo.
              </p>
              <button className="btn-danger" onClick={remove} disabled={busy}>
                Delete forever
              </button>
            </div>
          ) : (
            <button
              className="mt-2 text-sm font-medium text-red-600 hover:underline"
              onClick={() => setConfirmDelete(true)}
            >
              Delete this trip…
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
