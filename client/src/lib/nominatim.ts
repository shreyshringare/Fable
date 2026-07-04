export interface SearchResult {
  display_name: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  website: string | null;
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

/**
 * Free-text place search via OpenStreetMap Nominatim (no API key).
 * `extratags` carries the real-world metadata OSM volunteers collected —
 * including the place's official website, which we keep for redirect links.
 */
export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&extratags=1&q=` +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data as any[]).map((r) => {
    const tags = r.extratags ?? {};
    let website: string | null =
      tags.website || tags['contact:website'] || tags.url || null;
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    return {
      display_name: r.display_name,
      name: r.name || String(r.display_name).split(',')[0],
      lat: Number(r.lat),
      lng: Number(r.lon),
      category: CATEGORY_MAP[r.type] ?? 'other',
      website,
    };
  });
}

/** Google Maps directions deep-link for any coordinate. */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
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
