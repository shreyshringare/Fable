import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { fetchTripWeather, weatherInfo, type DayWeather } from '../lib/weather';
import { useTripStore } from '../store/trip';
import DayNotes from './DayNotes';
import MapView from './MapView';
import PlaceCard from './PlaceCard';
import PlaceSearch from './PlaceSearch';
import type { Place } from '../types';

function DayButton({
  dayId,
  label,
  sub,
  active,
  weather,
  onClick,
}: {
  dayId: string;
  label: string;
  sub: string;
  active: boolean;
  weather?: DayWeather;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayId}` });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : isOver
            ? 'bg-amber-100 dark:bg-amber-900/40'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {weather && (
          <span
            className="text-xs"
            title={`${weatherInfo(weather.code).label} ${weather.tmin}–${weather.tmax}°C${
              weather.approximate ? ' (seasonal average)' : ''
            }`}
          >
            {weatherInfo(weather.code).icon} {weather.tmax}°
          </span>
        )}
      </div>
      <div className={`text-xs ${active ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
        {sub}
      </div>
    </button>
  );
}

export default function PlannerTab({ canEdit }: { canEdit: boolean }) {
  const { days, places, selectedDayId, selectDay, setPlacesForDay, trip } = useTripStore();
  const [weather, setWeather] = useState<Record<string, DayWeather>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dayPlaces = useMemo(
    () =>
      places
        .filter((p) => p.day_id === selectedDayId)
        .sort((a, b) => a.order_index - b.order_index),
    [places, selectedDayId],
  );

  // Weather: anchor on the first geocoded place of the trip.
  useEffect(() => {
    const anchor = places.find((p) => p.lat != null && p.lng != null);
    if (!anchor || !trip?.start_date || !trip?.end_date) return;
    fetchTripWeather(anchor.lat!, anchor.lng!, trip.start_date, trip.end_date).then(setWeather);
  }, [places, trip?.start_date, trip?.end_date]);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || !selectedDayId || !canEdit) return;
    const placeId = String(active.id);
    const overId = String(over.id);

    if (overId.startsWith('day:')) {
      const targetDay = overId.slice(4);
      const place = places.find((p) => p.id === placeId);
      if (!place || place.day_id === targetDay) return;
      // Optimistic cross-day move.
      setPlacesForDay(place.day_id, dayPlaces.filter((p) => p.id !== placeId));
      useTripStore.setState((s) => ({
        places: s.places.map((p) => (p.id === placeId ? { ...p, day_id: targetDay } : p)),
      }));
      try {
        await api.patch(`/trips/${place.trip_id}/days/${place.day_id}/places/${placeId}`, {
          day_id: targetDay,
        });
      } catch {
        useTripStore.getState().reload();
      }
      return;
    }

    if (placeId !== overId) {
      const oldIndex = dayPlaces.findIndex((p) => p.id === placeId);
      const newIndex = dayPlaces.findIndex((p) => p.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(dayPlaces, oldIndex, newIndex).map((p, i) => ({
        ...p,
        order_index: i,
      }));
      setPlacesForDay(selectedDayId, next);
      try {
        await api.post(
          `/trips/${next[0].trip_id}/days/${selectedDayId}/places/reorder`,
          { items: next.map((p) => ({ id: p.id, order_index: p.order_index })) },
        );
      } catch {
        useTripStore.getState().reload();
      }
    }
  }

  const selectedDay = days.find((d) => d.id === selectedDayId);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
        {/* Days sidebar */}
        <aside className="card h-fit max-h-[75vh] space-y-1 overflow-y-auto p-2">
          {days.length === 0 && (
            <p className="p-3 text-sm text-gray-500 dark:text-gray-400">
              No days yet — set trip dates to generate the itinerary.
            </p>
          )}
          {days.map((d, i) => (
            <DayButton
              key={d.id}
              dayId={d.id}
              label={`Day ${i + 1}`}
              sub={format(new Date(d.date), 'EEE, MMM d')}
              active={d.id === selectedDayId}
              weather={weather[d.date]}
              onClick={() => selectDay(d.id)}
            />
          ))}
        </aside>

        {/* Day planner */}
        <section className="space-y-4">
          {selectedDay ? (
            <>
              {canEdit && <PlaceSearch dayId={selectedDay.id} />}
              <SortableContext
                items={dayPlaces.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {dayPlaces.length === 0 && (
                    <div className="card flex flex-col items-center py-10 text-center">
                      <div className="text-4xl">🌄</div>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Nothing planned for this day yet.
                        {canEdit ? ' Search above or click the map to add a stop.' : ''}
                      </p>
                    </div>
                  )}
                  {dayPlaces.map((p: Place, i) => (
                    <PlaceCard key={p.id} place={p} index={i} canEdit={canEdit} />
                  ))}
                </div>
              </SortableContext>
              <DayNotes dayId={selectedDay.id} canEdit={canEdit} />
            </>
          ) : (
            <div className="card p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a day to start planning.
            </div>
          )}
        </section>

        {/* Map */}
        <section className="h-[75vh] min-h-[400px]">
          <MapView canEdit={canEdit} />
        </section>
      </div>
    </DndContext>
  );
}
