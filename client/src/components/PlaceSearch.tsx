import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { PLACE_CATEGORIES, searchPlaces, type SearchResult } from '../lib/nominatim';
import { useTripStore } from '../store/trip';

export default function PlaceSearch({ dayId }: { dayId: string }) {
  const tripId = useTripStore((s) => s.tripId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const r = await searchPlaces(query);
      setResults(r);
      setOpen(true);
      setSearching(false);
    }, 450);
    return () => timer.current && clearTimeout(timer.current);
  }, [query]);

  async function add(r: SearchResult) {
    setOpen(false);
    setQuery('');
    await api.post(`/trips/${tripId}/days/${dayId}/places`, {
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      address: r.display_name,
      category: r.category,
      website: r.website ?? undefined,
    });
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          className="input pl-9"
          placeholder="Search places (OpenStreetMap)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {searching ? '⏳' : '🔍'}
        </span>
      </div>
      {open && results.length > 0 && (
        <div className="card absolute z-30 mt-1 w-full overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-gray-700"
              onMouseDown={() => add(r)}
            >
              <span>{PLACE_CATEGORIES.find((c) => c.value === r.category)?.icon ?? '📍'}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                  {r.display_name}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
