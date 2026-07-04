import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { socket } from '../lib/ws';
import { formatMoney, toUSD } from '../lib/currency';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toast';
import { useTripStore } from '../store/trip';
import Avatar from '../components/Avatar';
import TripSettingsModal from '../components/TripSettingsModal';

const PlannerTab = lazy(() => import('../components/PlannerTab'));
const ReservationsTab = lazy(() => import('../components/ReservationsTab'));
const BudgetTab = lazy(() => import('../components/BudgetTab'));
const PackingTab = lazy(() => import('../components/PackingTab'));
const ChatTab = lazy(() => import('../components/ChatTab'));
const MembersPanel = lazy(() => import('../components/MembersPanel'));

const TABS = [
  { id: 'planner', label: 'Planner', icon: '🗓️' },
  { id: 'reservations', label: 'Reservations', icon: '🎫' },
  { id: 'budget', label: 'Budget', icon: '💰' },
  { id: 'packing', label: 'Packing', icon: '🎒' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'members', label: 'Members', icon: '👥' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-64 w-full" />
    </div>
  );
}

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { trip, members, presence, places, budget, packing, loading, load, reset } =
    useTripStore();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<TabId>('planner');
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const hadTrip = useRef(false);

  useEffect(() => {
    if (!tripId) return;
    setError('');
    hadTrip.current = false;
    load(tripId).catch((e) => setError(e.message || 'Failed to load trip'));
    socket.joinTrip(tripId);
    return () => {
      socket.leaveTrip();
      reset();
    };
  }, [tripId, load, reset]);

  // Trip deleted (by us or via WS while viewing) → back to dashboard.
  useEffect(() => {
    if (trip) hadTrip.current = true;
    else if (hadTrip.current && !loading) {
      toast('This trip was deleted', 'info');
      navigate('/');
    }
  }, [trip, loading, navigate]);

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

  const role = members.find((m) => m.id === user?.id)?.role ?? 'viewer';
  const canEdit = role !== 'viewer';
  const budgetTotal = budget.reduce((sum, b) => sum + toUSD(b.amount, b.currency), 0);
  const packedCount = packing.filter((i) => i.packed).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold">{trip.name}</h1>
          {canEdit && (
            <button
              onClick={() => setShowSettings(true)}
              title="Trip settings"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            >
              ⚙️
            </button>
          )}
        </div>
        <div className="flex -space-x-2" title="Currently viewing">
          {presence.map((u) => (
            <Avatar key={u.id} name={u.name} url={u.avatar_url} size={30} title={`${u.name} is here`} />
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {trip.start_date && trip.end_date
          ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
              new Date(trip.end_date),
              'MMM d, yyyy',
            )}`
          : 'Dates TBD'}
        {trip.description ? ` · ${trip.description}` : ''}
      </p>

      {/* Quick stats */}
      <div className="mt-3 mb-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          📍 {places.length} place{places.length !== 1 ? 's' : ''}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          💰 {formatMoney(budgetTotal)}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          🎒 {packedCount}/{packing.length} packed
        </span>
        <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium capitalize text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
          {role}
        </span>
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

      <Suspense fallback={<TabSkeleton />}>
        {tab === 'planner' && <PlannerTab canEdit={canEdit} />}
        {tab === 'reservations' && <ReservationsTab canEdit={canEdit} />}
        {tab === 'budget' && <BudgetTab canEdit={canEdit} />}
        {tab === 'packing' && <PackingTab canEdit={canEdit} />}
        {tab === 'chat' && <ChatTab canEdit={canEdit} />}
        {tab === 'members' && <MembersPanel role={role} />}
      </Suspense>

      {showSettings && (
        <TripSettingsModal
          trip={trip}
          isOwner={role === 'owner'}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
