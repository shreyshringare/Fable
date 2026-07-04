import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile } from '../lib/api';
import type { TripDetail } from '../types';
import Modal from './Modal';

export default function CreateTripModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (startDate && endDate && endDate < startDate) {
      setError('End date must be after start date');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let cover_image: string | undefined;
      if (cover) cover_image = (await uploadFile('covers', cover)).url;
      const detail = await api.post<TripDetail>('/trips', {
        name,
        description: description || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        cover_image,
      });
      navigate(`/trips/${detail.trip.id}`);
    } catch (err: any) {
      setError(err.message || 'Could not create trip');
      setBusy(false);
    }
  }

  return (
    <Modal title="New trip" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Trip name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer in Kyoto"
            required
            autoFocus
          />
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
        <div>
          <label className="label">Cover image</label>
          <input
            type="file"
            accept="image/*"
            className="input"
            onChange={(e) => setCover(e.target.files?.[0] ?? null)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create trip'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
