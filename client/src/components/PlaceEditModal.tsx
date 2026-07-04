import { FormEvent, useState } from 'react';
import { api, uploadFile } from '../lib/api';
import { PLACE_CATEGORIES } from '../lib/nominatim';
import type { Place } from '../types';
import Modal from './Modal';

export default function PlaceEditModal({ place, onClose }: { place: Place; onClose: () => void }) {
  const [form, setForm] = useState({
    name: place.name,
    category: place.category,
    address: place.address ?? '',
    rating: place.rating != null ? String(place.rating) : '',
    hours: place.hours ?? '',
    notes: place.notes ?? '',
    website: place.website ?? '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let photo_url: string | undefined;
      if (photo) photo_url = (await uploadFile('places', photo)).url;
      await api.patch(`/trips/${place.trip_id}/days/${place.day_id}/places/${place.id}`, {
        name: form.name,
        category: form.category,
        address: form.address || undefined,
        rating: form.rating === '' ? undefined : Number(form.rating),
        hours: form.hours || undefined,
        notes: form.notes || undefined,
        website: form.website || undefined,
        ...(photo_url ? { photo_url } : {}),
      });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${place.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {PLACE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Rating (0–5)</label>
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              className="input"
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input
            className="input"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Website</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Opening hours</label>
          <input
            className="input"
            placeholder="Mon–Sun 9:00–18:00"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
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
        <div>
          <label className="label">Photo</label>
          <input
            type="file"
            accept="image/*"
            className="input"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
