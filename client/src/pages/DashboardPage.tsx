import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format } from 'date-fns';
import { api } from '../lib/api';
import CreateTripModal from '../components/CreateTripModal';
import type { Trip } from '../types';

type TripStatus = { label: string; cls: string; rank: number; sortKey: string };

function tripStatus(trip: Trip): TripStatus {
  if (!trip.start_date || !trip.end_date) {
    return { label: 'Dates TBD', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', rank: 2, sortKey: '9999' };
  }
  const toStart = differenceInCalendarDays(new Date(`${trip.start_date}T00:00:00`), new Date());
  const toEnd = differenceInCalendarDays(new Date(`${trip.end_date}T00:00:00`), new Date());
  if (toStart <= 0 && toEnd >= 0) {
    return { label: '🌍 Happening now', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', rank: 0, sortKey: trip.start_date };
  }
  if (toStart > 0) {
    return { label: `🛫 In ${toStart} day${toStart > 1 ? 's' : ''}`, cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', rank: 1, sortKey: trip.start_date };
  }
  return { label: 'Completed', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400', rank: 3, sortKey: trip.end_date };
}

function TripCard({ trip }: { trip: Trip }) {
  const status = tripStatus(trip);
  return (
    <Link
      to={`/trips/${trip.id}`}
      className="card group overflow-hidden transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg dark:hover:border-indigo-600"
    >
      <div className="h-32 bg-gradient-to-br from-indigo-500 to-amber-400">
        {trip.cover_image && (
          <img src={trip.cover_image} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            {trip.name}
          </h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>
            {status.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {trip.start_date && trip.end_date
            ? `${format(new Date(`${trip.start_date}T00:00:00`), 'MMM d')} – ${format(
                new Date(`${trip.end_date}T00:00:00`),
                'MMM d, yyyy',
              )}`
            : 'Dates TBD'}
          {' · '}
          {trip.member_count} traveller{(trip.member_count ?? 1) > 1 ? 's' : ''}
        </p>
        {trip.description && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
            {trip.description}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get<Trip[]>('/trips').then(setTrips).catch(() => setTrips([]));
  }, []);

  // Ongoing first, then upcoming (soonest first), then undated, then past.
  const sorted = useMemo(
    () =>
      (trips ?? [])
        .map((t) => ({ t, s: tripStatus(t) }))
        .sort((a, b) => a.s.rank - b.s.rank || a.s.sortKey.localeCompare(b.s.sortKey))
        .map((x) => x.t),
    [trips],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Your trips</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New trip
        </button>
      </div>

      {trips === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton h-32 !rounded-b-none" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-5 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl">🗺️</div>
          <h2 className="mt-4 text-lg font-bold">No adventures yet</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Every great story starts with a first step.
          </p>
          <button className="btn-primary mt-4" onClick={() => setShowCreate(true)}>
            Plan your first trip
          </button>
        </div>
      ) : (
        <div className="fade-in grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}

      {showCreate && <CreateTripModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
