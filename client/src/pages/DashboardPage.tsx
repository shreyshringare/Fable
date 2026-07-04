import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../lib/api';
import CreateTripModal from '../components/CreateTripModal';
import type { Trip } from '../types';

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      to={`/trips/${trip.id}`}
      className="card group overflow-hidden transition-transform hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="h-32 bg-gradient-to-br from-indigo-500 to-amber-400">
        {trip.cover_image && (
          <img src={trip.cover_image} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
          {trip.name}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {trip.start_date && trip.end_date
            ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
                new Date(trip.end_date),
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}

      {showCreate && <CreateTripModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
