import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { socket } from '../lib/ws';
import { useAuthStore } from '../store/auth';
import { useTripStore } from '../store/trip';
import Avatar from '../components/Avatar';
import BudgetTab from '../components/BudgetTab';
import ChatTab from '../components/ChatTab';
import MembersPanel from '../components/MembersPanel';
import PackingTab from '../components/PackingTab';
import PlannerTab from '../components/PlannerTab';
import ReservationsTab from '../components/ReservationsTab';

const TABS = [
  { id: 'planner', label: 'Planner', icon: '🗓️' },
  { id: 'reservations', label: 'Reservations', icon: '🎫' },
  { id: 'budget', label: 'Budget', icon: '💰' },
  { id: 'packing', label: 'Packing', icon: '🎒' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'members', label: 'Members', icon: '👥' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { trip, presence, loading, load, reset } = useTripStore();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<TabId>('planner');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tripId) return;
    setError('');
    load(tripId).catch((e) => setError(e.message || 'Failed to load trip'));
    socket.joinTrip(tripId);
    return () => {
      socket.leaveTrip();
      reset();
    };
  }, [tripId, load, reset]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="text-5xl">🧭</div>
        <h1 className="mt-4 text-xl font-bold">Cannot open this trip</h1>
        <p className="mt-1 text-sm text-gray-500">{error}</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">
          Back to trips
        </Link>
      </div>
    );
  }

  if (loading || !trip) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-6 w-96" />
        <div className="skeleton h-96 w-full" />
      </div>
    );
  }

  const role = useTripStore.getState().members.find((m) => m.id === user?.id)?.role ?? 'viewer';
  const canEdit = role !== 'viewer';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{trip.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {trip.start_date && trip.end_date
              ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
                  new Date(trip.end_date),
                  'MMM d, yyyy',
                )}`
              : 'Dates TBD'}
            {trip.description ? ` · ${trip.description}` : ''}
          </p>
        </div>
        <div className="flex -space-x-2" title="Currently viewing">
          {presence.map((u) => (
            <Avatar key={u.id} name={u.name} url={u.avatar_url} size={30} title={`${u.name} is here`} />
          ))}
        </div>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white text-indigo-600 shadow dark:bg-gray-700 dark:text-indigo-300'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === 'planner' && <PlannerTab canEdit={canEdit} />}
      {tab === 'reservations' && <ReservationsTab canEdit={canEdit} />}
      {tab === 'budget' && <BudgetTab canEdit={canEdit} />}
      {tab === 'packing' && <PackingTab canEdit={canEdit} />}
      {tab === 'chat' && <ChatTab canEdit={canEdit} />}
      {tab === 'members' && <MembersPanel role={role} />}
    </div>
  );
}
