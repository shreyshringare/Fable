import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  BudgetItem,
  Day,
  DayNote,
  Member,
  Message,
  PackingItem,
  Place,
  Reservation,
  Trip,
  TripDetail,
  User,
  WsEvent,
} from '../types';

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
}

interface TripState {
  tripId: string | null;
  trip: Trip | null;
  members: Member[];
  days: Day[];
  places: Place[];
  notes: DayNote[];
  reservations: Reservation[];
  budget: BudgetItem[];
  packing: PackingItem[];
  messages: Message[];
  presence: User[];
  typing: { userId: string; name: string; at: number } | null;
  selectedDayId: string | null;
  highlightPlaceId: string | null;
  loading: boolean;

  load: (tripId: string) => Promise<void>;
  reload: () => Promise<void>;
  reset: () => void;
  selectDay: (dayId: string | null) => void;
  highlightPlace: (placeId: string | null) => void;
  applyEvent: (evt: WsEvent) => void;

  // Optimistic helpers
  setPlacesForDay: (dayId: string, places: Place[]) => void;
  patchPacking: (item: PackingItem) => void;
}

const empty = {
  trip: null as Trip | null,
  members: [] as Member[],
  days: [] as Day[],
  places: [] as Place[],
  notes: [] as DayNote[],
  reservations: [] as Reservation[],
  budget: [] as BudgetItem[],
  packing: [] as PackingItem[],
  messages: [] as Message[],
  presence: [] as User[],
  typing: null as { userId: string; name: string; at: number } | null,
  selectedDayId: null as string | null,
  highlightPlaceId: null as string | null,
};

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const useTripStore = create<TripState>((set, get) => ({
  tripId: null,
  ...empty,
  loading: false,

  load: async (tripId) => {
    set({ tripId, loading: true, ...empty });
    const [detail, reservations, budget, packing, messages] = await Promise.all([
      api.get<TripDetail>(`/trips/${tripId}`),
      api.get<Reservation[]>(`/trips/${tripId}/reservations`),
      api.get<BudgetItem[]>(`/trips/${tripId}/budget`),
      api.get<PackingItem[]>(`/trips/${tripId}/packing`),
      api.get<Message[]>(`/trips/${tripId}/messages`),
    ]);
    set({
      trip: detail.trip,
      members: detail.members,
      days: detail.days,
      places: detail.places,
      notes: detail.notes,
      reservations,
      budget,
      packing,
      messages,
      // If the trip is happening right now, open today's plan first.
      selectedDayId:
        (detail.days.find((d) => d.date === localToday()) ?? detail.days[0])?.id ?? null,
      loading: false,
    });
  },

  reload: async () => {
    const tripId = get().tripId;
    if (!tripId) return;
    try {
      const detail = await api.get<TripDetail>(`/trips/${tripId}`);
      set({
        trip: detail.trip,
        members: detail.members,
        days: detail.days,
        places: detail.places,
        notes: detail.notes,
      });
    } catch {
      /* trip gone or auth lost; page-level guards handle it */
    }
  },

  reset: () => set({ tripId: null, ...empty, loading: false }),

  selectDay: (dayId) => set({ selectedDayId: dayId, highlightPlaceId: null }),
  highlightPlace: (placeId) => set({ highlightPlaceId: placeId }),

  applyEvent: (evt) => {
    const s = get();
    if (evt.tripId !== s.tripId) return;
    const p = evt.payload;
    switch (evt.type) {
      case 'TRIP_UPDATED':
        set({ trip: { ...s.trip, ...p } });
        // Date range edits can add/remove days — re-sync.
        void s.reload();
        break;
      case 'TRIP_DELETED':
        set({ trip: null });
        break;
      case 'MEMBERS_UPDATED':
        set({ members: p.members });
        break;
      case 'PRESENCE':
        set({ presence: p.users });
        break;
      case 'TYPING':
        set({ typing: { userId: p.userId, name: p.name, at: Date.now() } });
        break;
      case 'DAY_ADDED':
        set({ days: [...upsert(s.days, p)].sort((a, b) => a.date.localeCompare(b.date)) });
        break;
      case 'DAY_UPDATED':
        set({ days: upsert(s.days, p).sort((a, b) => a.date.localeCompare(b.date)) });
        break;
      case 'DAY_DELETED':
        set({
          days: s.days.filter((d) => d.id !== p.id),
          places: s.places.filter((pl) => pl.day_id !== p.id),
          selectedDayId: s.selectedDayId === p.id ? null : s.selectedDayId,
        });
        break;
      case 'PLACE_ADDED':
      case 'PLACE_UPDATED':
      case 'PLACE_MOVED':
        set({ places: upsert(s.places, p) });
        break;
      case 'PLACE_DELETED':
        set({ places: s.places.filter((x) => x.id !== p.id) });
        break;
      case 'PLACES_REORDERED':
        set({
          places: [
            ...s.places.filter((x) => x.day_id !== p.dayId),
            ...p.places,
          ],
        });
        break;
      case 'NOTE_ADDED':
      case 'NOTE_UPDATED':
        set({ notes: upsert(s.notes, p) });
        break;
      case 'NOTE_DELETED':
        set({ notes: s.notes.filter((n) => n.id !== p.id) });
        break;
      case 'NOTES_REORDERED':
        set({
          notes: [...s.notes.filter((n) => n.day_id !== p.dayId), ...p.notes],
        });
        break;
      case 'RESERVATION_UPDATED':
        set({
          reservations:
            p.action === 'deleted'
              ? s.reservations.filter((r) => r.id !== p.item.id)
              : upsert(s.reservations, p.item),
        });
        break;
      case 'BUDGET_UPDATED':
        set({
          budget:
            p.action === 'deleted'
              ? s.budget.filter((b) => b.id !== p.item.id)
              : upsert(s.budget, p.item),
        });
        break;
      case 'PACKING_UPDATED':
        set({
          packing:
            p.action === 'deleted'
              ? s.packing.filter((i) => i.id !== p.item.id)
              : upsert(s.packing, p.item),
        });
        break;
      case 'MESSAGE_SENT':
        set({ messages: upsert(s.messages, p) });
        break;
      default:
        break;
    }
  },

  setPlacesForDay: (dayId, places) =>
    set({
      places: [...get().places.filter((p) => p.day_id !== dayId), ...places],
    }),

  patchPacking: (item) => set({ packing: upsert(get().packing, item) }),
}));
