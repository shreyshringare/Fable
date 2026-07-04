import type { Reservation, Trip } from '../types';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** '2026-07-10T09:30' → '20260710T093000' (floating local time). */
function toIcsDateTime(v: string): string {
  const compact = v.replace(/[-:]/g, '');
  return compact.length === 13 ? `${compact}00` : compact.slice(0, 15);
}

function toIcsDate(v: string): string {
  return v.replace(/-/g, '');
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const TYPE_LABEL: Record<string, string> = {
  flight: '✈️',
  accommodation: '🏨',
  restaurant: '🍽️',
  transport: '🚆',
};

/** Build an iCalendar file: one all-day span for the trip + one event per reservation. */
export function buildTripICS(trip: Trip, reservations: Reservation[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fable//Trip Planner//EN',
    'CALSCALE:GREGORIAN',
  ];

  if (trip.start_date && trip.end_date) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:trip-${trip.id}@fable`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(trip.start_date)}`,
      `DTEND;VALUE=DATE:${toIcsDate(nextDay(trip.end_date))}`,
      `SUMMARY:${esc(`🧭 ${trip.name}`)}`,
      ...(trip.description ? [`DESCRIPTION:${esc(trip.description)}`] : []),
      'END:VEVENT',
    );
  }

  for (const r of reservations) {
    if (!r.start_datetime) continue;
    const desc = [
      r.confirmation_number ? `Confirmation: ${r.confirmation_number}` : '',
      r.notes ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:res-${r.id}@fable`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsDateTime(r.start_datetime)}`,
      `DTEND:${toIcsDateTime(r.end_datetime ?? r.start_datetime)}`,
      `SUMMARY:${esc(`${TYPE_LABEL[r.type] ?? ''} ${r.title}`.trim())}`,
      ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
      `STATUS:${r.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
