export interface SearchResult {
  display_name: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
}

const CATEGORY_MAP: Record<string, string> = {
  restaurant: 'food',
  cafe: 'food',
  bar: 'food',
  fast_food: 'food',
  hotel: 'lodging',
  guest_house: 'lodging',
  hostel: 'lodging',
  museum: 'sight',
  attraction: 'sight',
  monument: 'sight',
  castle: 'sight',
  viewpoint: 'sight',
  park: 'nature',
  beach: 'nature',
  peak: 'nature',
  station: 'transport',
  airport: 'transport',
  bus_station: 'transport',
};

/** Free-text place search via OpenStreetMap Nominatim (no API key). */
export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&q=` +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data as any[]).map((r) => ({
    display_name: r.display_name,
    name: r.name || String(r.display_name).split(',')[0],
    lat: Number(r.lat),
    lng: Number(r.lon),
    category: CATEGORY_MAP[r.type] ?? 'other',
  }));
}

export const PLACE_CATEGORIES = [
  { value: 'sight', label: 'Sight', icon: '🏛️' },
  { value: 'food', label: 'Food & Drink', icon: '🍽️' },
  { value: 'lodging', label: 'Lodging', icon: '🛏️' },
  { value: 'nature', label: 'Nature', icon: '🌲' },
  { value: 'transport', label: 'Transport', icon: '🚆' },
  { value: 'shopping', label: 'Shopping', icon: '🛍️' },
  { value: 'other', label: 'Other', icon: '📍' },
];

export function categoryIcon(category: string): string {
  return PLACE_CATEGORIES.find((c) => c.value === category)?.icon ?? '📍';
}
