export interface DayWeather {
  code: number;
  tmax: number;
  tmin: number;
  approximate: boolean;
}

/** WMO weather code → emoji + label. */
export function weatherInfo(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' };
  if (code <= 2) return { icon: '🌤️', label: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', label: 'Overcast' };
  if (code <= 48) return { icon: '🌫️', label: 'Fog' };
  if (code <= 57) return { icon: '🌦️', label: 'Drizzle' };
  if (code <= 67) return { icon: '🌧️', label: 'Rain' };
  if (code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code <= 82) return { icon: '🌧️', label: 'Showers' };
  if (code <= 86) return { icon: '🌨️', label: 'Snow showers' };
  return { icon: '⛈️', label: 'Thunderstorm' };
}

const cache = new Map<string, Record<string, DayWeather>>();

/**
 * Weather per date for a trip. Uses the Open-Meteo 16-day forecast; dates
 * beyond the forecast window fall back to last year's observed weather
 * (archive API) as a climate approximation.
 */
export async function fetchTripWeather(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<Record<string, DayWeather>> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${startDate},${endDate}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const result: Record<string, DayWeather> = {};
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  const forecastStart = startDate < today ? today : startDate;
  const forecastEnd = endDate < horizon ? endDate : horizon;

  try {
    if (forecastStart <= forecastEnd) {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&start_date=${forecastStart}&end_date=${forecastEnd}&timezone=auto`;
      const data = await (await fetch(url)).json();
      (data.daily?.time ?? []).forEach((date: string, i: number) => {
        result[date] = {
          code: data.daily.weather_code[i],
          tmax: Math.round(data.daily.temperature_2m_max[i]),
          tmin: Math.round(data.daily.temperature_2m_min[i]),
          approximate: false,
        };
      });
    }

    // Dates outside the forecast horizon: use same dates last year as climate proxy.
    const missing: string[] = [];
    const d = new Date(`${startDate}T00:00:00Z`);
    const stop = new Date(`${endDate}T00:00:00Z`);
    while (d <= stop) {
      const iso = d.toISOString().slice(0, 10);
      if (!result[iso]) missing.push(iso);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    if (missing.length) {
      const lastYear = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&start_date=${lastYear(missing[0])}&end_date=${lastYear(missing[missing.length - 1])}` +
        `&timezone=auto`;
      const data = await (await fetch(url)).json();
      const byDate: Record<string, DayWeather> = {};
      (data.daily?.time ?? []).forEach((date: string, i: number) => {
        byDate[date] = {
          code: data.daily.weather_code[i],
          tmax: Math.round(data.daily.temperature_2m_max[i]),
          tmin: Math.round(data.daily.temperature_2m_min[i]),
          approximate: true,
        };
      });
      for (const iso of missing) {
        const w = byDate[lastYear(iso)];
        if (w) result[iso] = w;
      }
    }
  } catch {
    /* weather is decorative — fail quietly */
  }

  cache.set(key, result);
  return result;
}
