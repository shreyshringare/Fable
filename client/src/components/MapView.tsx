import L from 'leaflet';
import 'leaflet.markercluster';
import { FormEvent, useEffect, useRef, useState } from 'react';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import iconDefault from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { api } from '../lib/api';
import { PLACE_CATEGORIES } from '../lib/nominatim';
import { useTripStore } from '../store/trip';
import Modal from './Modal';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: iconDefault,
  shadowUrl: iconShadow,
});

export default function MapView({ canEdit }: { canEdit: boolean }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const { places, selectedDayId, tripId, highlightPlace } = useTripStore();
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinName, setPinName] = useState('');
  const [pinCategory, setPinCategory] = useState('other');
  const pinMode = useRef(false);
  const [addingPin, setAddingPin] = useState(false);

  // Init map once.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { center: [20, 0], zoom: 2 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup();
    map.addLayer(cluster);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (pinMode.current) {
        setPin({ lat: e.latlng.lat, lng: e.latlng.lng });
        pinMode.current = false;
        setAddingPin(false);
      }
    });
    mapRef.current = map;
    clusterRef.current = cluster;
    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Sync markers + route with the selected day's places.
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;
    cluster.clearLayers();
    routeRef.current?.remove();
    routeRef.current = null;

    const dayPlaces = places
      .filter((p) => p.day_id === selectedDayId && p.lat != null && p.lng != null)
      .sort((a, b) => a.order_index - b.order_index);

    const latlngs: L.LatLngExpression[] = [];
    dayPlaces.forEach((p, i) => {
      const marker = L.marker([p.lat!, p.lng!], { title: p.name });
      marker.bindTooltip(`${i + 1}. ${p.name}`);
      marker.on('click', () => {
        highlightPlace(p.id);
        document
          .getElementById(`place-card-${p.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      cluster.addLayer(marker);
      latlngs.push([p.lat!, p.lng!]);
    });

    if (latlngs.length > 1) {
      routeRef.current = L.polyline(latlngs, {
        color: '#4f46e5',
        weight: 3,
        dashArray: '6 8',
      }).addTo(map);
    }
    if (latlngs.length > 0) {
      map.fitBounds(L.latLngBounds(latlngs).pad(0.25), { maxZoom: 15 });
    }
  }, [places, selectedDayId, highlightPlace]);

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
      <div ref={mapEl} className="h-full overflow-hidden rounded-xl shadow-md" />
      {canEdit && (
        <button
          onClick={() => {
            pinMode.current = !pinMode.current;
            setAddingPin(pinMode.current);
          }}
          className={`absolute right-3 top-3 z-[1000] rounded-lg px-3 py-2 text-sm font-medium shadow-md ${
            addingPin
              ? 'bg-amber-400 text-gray-900'
              : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200'
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
