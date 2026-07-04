import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { PLACE_CATEGORIES } from '../lib/nominatim';
import { useTripStore } from '../store/trip';
import Modal from './Modal';

/**
 * 3D map: MapLibre GL over OpenFreeMap vector tiles (free, no API key).
 * Latin/English labels, 45° pitch, extruded buildings at street zoom,
 * numbered pins per day with a dashed route line between them.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export default function MapView({ canEdit }: { canEdit: boolean }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const { places, selectedDayId, tripId, highlightPlace } = useTripStore();
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinName, setPinName] = useState('');
  const [pinCategory, setPinCategory] = useState('other');
  const pinMode = useRef(false);
  const [addingPin, setAddingPin] = useState(false);

  // Init once.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: STYLE_URL,
      center: [10, 25],
      zoom: 1.4,
      pitch: 45,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

    map.on('load', () => {
      // Extruded buildings for the "little 3D" city look (vector layer ships
      // with the OpenMapTiles schema used by OpenFreeMap).
      try {
        map.addLayer({
          id: 'fable-3d-buildings',
          source: 'openmaptiles',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#c7d2fe',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.55,
          },
        });
      } catch {
        /* style variant without a building layer — map still works flat */
      }
      // Prefer romanized names everywhere the tiles provide them.
      try {
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
            map.setLayoutProperty(layer.id, 'text-field', [
              'coalesce',
              ['get', 'name:en'],
              ['get', 'name:latin'],
              ['get', 'name'],
            ]);
          }
        }
      } catch {
        /* best effort */
      }
      setReady(true);
    });

    map.on('click', (e) => {
      if (pinMode.current) {
        setPin({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        pinMode.current = false;
        setAddingPin(false);
      }
    });

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync pins + route with the selected day.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const dayPlaces = places
      .filter((p) => p.day_id === selectedDayId && p.lat != null && p.lng != null)
      .sort((a, b) => a.order_index - b.order_index);

    const coords: [number, number][] = [];
    dayPlaces.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'fable-pin';
      el.textContent = String(i + 1);
      el.title = p.name;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        highlightPlace(p.id);
        document
          .getElementById(`place-card-${p.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([p.lng!, p.lat!])
        .addTo(map);
      markersRef.current.push(marker);
      coords.push([p.lng!, p.lat!]);
    });

    const routeData: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords.length > 1 ? coords : [] },
    };
    const src = map.getSource('fable-route') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(routeData);
    } else {
      map.addSource('fable-route', { type: 'geojson', data: routeData });
      map.addLayer({
        id: 'fable-route-line',
        type: 'line',
        source: 'fable-route',
        paint: {
          'line-color': '#4f46e5',
          'line-width': 3,
          'line-dasharray': [1.5, 2],
          'line-opacity': 0.85,
        },
      });
    }

    if (coords.length > 0) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: 70, maxZoom: 15.5, duration: 900 });
    }
  }, [places, selectedDayId, ready, highlightPlace]);

  async function addPin(e: FormEvent) {
    e.preventDefault();
    if (!pin || !selectedDayId) return;
    await api.post(`/trips/${tripId}/days/${selectedDayId}/places`, {
      name: pinName,
      lat: pin.lat,
      lng: pin.lng,
      category: pinCategory,
    });
    setPin(null);
    setPinName('');
  }

  return (
    <div className="relative h-full">
      <div ref={mapEl} className="h-full overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-gray-700" />
      {canEdit && (
        <button
          onClick={() => {
            pinMode.current = !pinMode.current;
            setAddingPin(pinMode.current);
          }}
          className={`absolute right-3 top-3 z-10 rounded-lg px-3 py-2 text-sm font-medium shadow-md transition-colors ${
            addingPin
              ? 'bg-amber-400 text-gray-900'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200'
          }`}
        >
          {addingPin ? 'Click the map…' : '📌 Drop pin'}
        </button>
      )}
      {pin && (
        <Modal title="Add place from map" onClose={() => setPin(null)}>
          <form onSubmit={addPin} className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            </p>
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={pinName}
                onChange={(e) => setPinName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={pinCategory}
                onChange={(e) => setPinCategory(e.target.value)}
              >
                {PLACE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPin(null)}>
                Cancel
              </button>
              <button className="btn-primary">Add place</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
