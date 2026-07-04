import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { api } from '../lib/api';
import { categoryIcon, directionsUrl } from '../lib/nominatim';
import { useTripStore } from '../store/trip';
import type { Place } from '../types';
import LorePanel from './LorePanel';
import PlaceEditModal from './PlaceEditModal';

export default function PlaceCard({
  place,
  index,
  canEdit,
}: {
  place: Place;
  index: number;
  canEdit: boolean;
}) {
  const highlightId = useTripStore((s) => s.highlightPlaceId);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(place.notes ?? '');
  const [showLore, setShowLore] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    disabled: !canEdit,
  });

  async function remove() {
    if (!window.confirm(`Remove "${place.name}" from this day?`)) return;
    await api.delete(`/trips/${place.trip_id}/days/${place.day_id}/places/${place.id}`);
  }

  async function saveNotes() {
    setEditingNotes(false);
    if (notes === (place.notes ?? '')) return;
    await api.patch(`/trips/${place.trip_id}/days/${place.day_id}/places/${place.id}`, { notes });
  }

  return (
    <div
      ref={setNodeRef}
      id={`place-card-${place.id}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card p-3 ${isDragging ? 'opacity-60 shadow-lg' : ''} ${
        highlightId === place.id ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab touch-none rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Drag to reorder or drop on a day"
          >
            ⠿
          </button>
        )}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span>{categoryIcon(place.category)}</span>
            <h4 className="truncate font-semibold">{place.name}</h4>
            {place.rating != null && (
              <span className="text-xs text-amber-500">★ {place.rating}</span>
            )}
          </div>
          {place.address && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{place.address}</p>
          )}
          {place.hours && (
            <p className="text-xs text-gray-500 dark:text-gray-400">🕐 {place.hours}</p>
          )}
          {(place.website || (place.lat != null && place.lng != null)) && (
            <p className="mt-1 flex flex-wrap gap-3 text-xs">
              {place.website && (
                <a
                  href={place.website}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  🌐 Website ↗
                </a>
              )}
              {place.lat != null && place.lng != null && (
                <a
                  href={directionsUrl(place.lat, place.lng)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  🧭 Directions ↗
                </a>
              )}
            </p>
          )}
          {place.photo_url && (
            <img
              src={place.photo_url}
              alt={place.name}
              className="mt-2 h-24 w-full rounded-lg object-cover"
            />
          )}
          {editingNotes ? (
            <textarea
              className="input mt-2 text-sm"
              rows={2}
              value={notes}
              autoFocus
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
            />
          ) : (
            (place.notes || canEdit) && (
              <p
                className={`mt-1 text-sm text-gray-600 dark:text-gray-300 ${
                  canEdit ? 'cursor-pointer hover:text-indigo-600' : ''
                }`}
                onClick={() => canEdit && setEditingNotes(true)}
              >
                {place.notes || <span className="italic text-gray-400">Add notes…</span>}
              </p>
            )
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setShowLore(true)}
            title="Lore: myths, legends & stories about this place"
            className="rounded p-1 text-base hover:bg-amber-50 dark:hover:bg-amber-900/30"
          >
            📜
          </button>
          {canEdit && (
            <>
              <button
                onClick={() => setShowEdit(true)}
                title="Edit place"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
              >
                ✏️
              </button>
              <button
                onClick={remove}
                title="Remove place"
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </div>
      {showLore && <LorePanel place={place} onClose={() => setShowLore(false)} />}
      {showEdit && <PlaceEditModal place={place} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
