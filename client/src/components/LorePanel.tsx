import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LoreResult, Place } from '../types';
import Modal from './Modal';

/**
 * Tourist lore for a place: mythology, legends, fiction appearances,
 * etymology and history, sourced from Wikipedia via the server.
 */
export default function LorePanel({ place, onClose }: { place: Place; onClose: () => void }) {
  const [lore, setLore] = useState<LoreResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ q: place.name });
    if (place.lat != null && place.lng != null) {
      params.set('lat', String(place.lat));
      params.set('lng', String(place.lng));
    }
    api
      .get<LoreResult>(`/lore?${params}`)
      .then(setLore)
      .catch(() => setFailed(true));
  }, [place]);

  return (
    <Modal title={`📜 Lore of ${place.name}`} onClose={onClose} wide>
      {failed && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The archives are silent — could not fetch lore right now.
        </p>
      )}
      {!lore && !failed && (
        <div className="space-y-3">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-24 w-full" />
        </div>
      )}
      {lore && (
        <div className="space-y-4">
          {lore.image && (
            <img
              src={lore.image}
              alt={lore.query}
              className="max-h-56 w-full rounded-xl object-cover"
            />
          )}
          {lore.about && (
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{lore.about}</p>
          )}
          {lore.facts.length === 0 && lore.about && (
            <p className="text-sm italic text-gray-500 dark:text-gray-400">
              No myths or legends recorded for this spot — maybe you'll write the first one.
            </p>
          )}
          {lore.facts.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
            >
              <div className="mb-1 flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
                <span>{/mytholog|legend|folklor|ghost|haunt|tale/i.test(f.heading) ? '🐉' : /fiction|culture|literature|film|media/i.test(f.heading) ? '🎬' : '🏺'}</span>
                {f.heading}
                <span className="font-normal text-amber-600/70 dark:text-amber-400/70">
                  · {f.source_title}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{f.text}</p>
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Read more on Wikipedia →
              </a>
            </div>
          ))}
          {!lore.about && lore.facts.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nothing found for this place. Try renaming it closer to its official name.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
