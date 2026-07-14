import { describe, it, expect } from 'vitest';
import { buildTripICS } from './ics';
import type { Trip, Reservation } from '../types';

const baseTrip: Trip = {
  id: 'trip-1',
  name: 'Paris Adventure',
  description: null,
  cover_image: null,
  start_date: '2026-08-01',
  end_date: '2026-08-10',
  owner_id: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
};

const baseReservation: Reservation = {
  id: 'res-1',
  trip_id: 'trip-1',
  type: 'flight',
  title: 'Air France AF123',
  confirmation_number: null,
  start_datetime: '2026-08-01T09:30',
  end_datetime: '2026-08-01T12:00',
  status: 'confirmed',
  notes: null,
  cost: null,
  attachment_url: null,
};

describe('buildTripICS', () => {
  it('wraps output in VCALENDAR/END:VCALENDAR', () => {
    const result = buildTripICS(baseTrip, []);
    const lines = result.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[1]).toBe('VERSION:2.0');
    expect(lines[2]).toBe('PRODID:-//Fable//Trip Planner//EN');
    expect(lines[3]).toBe('CALSCALE:GREGORIAN');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
  });

  it('includes trip VEVENT with correct DTSTART, DTEND, and SUMMARY when dates are set', () => {
    const result = buildTripICS(baseTrip, []);
    expect(result).toContain('BEGIN:VEVENT');
    expect(result).toContain('DTSTART;VALUE=DATE:20260801');
    // end_date + 1 day = 2026-08-11
    expect(result).toContain('DTEND;VALUE=DATE:20260811');
    expect(result).toContain('SUMMARY:🧭 Paris Adventure');
    expect(result).toContain('END:VEVENT');
  });

  it('omits trip VEVENT when dates are not set', () => {
    const tripNoDates: Trip = { ...baseTrip, start_date: null, end_date: null };
    const result = buildTripICS(tripNoDates, []);
    expect(result).not.toContain('BEGIN:VEVENT');
  });

  it('includes reservation VEVENT with correct DTSTART, SUMMARY with emoji, and STATUS:CONFIRMED', () => {
    const result = buildTripICS({ ...baseTrip, start_date: null, end_date: null }, [baseReservation]);
    expect(result).toContain('DTSTART:20260801T093000');
    expect(result).toContain('SUMMARY:✈️ Air France AF123');
    expect(result).toContain('STATUS:CONFIRMED');
  });

  it('sets STATUS:CANCELLED for a cancelled reservation', () => {
    const cancelled: Reservation = { ...baseReservation, status: 'cancelled' };
    const result = buildTripICS({ ...baseTrip, start_date: null, end_date: null }, [cancelled]);
    expect(result).toContain('STATUS:CANCELLED');
  });

  it('escapes commas and semicolons in SUMMARY', () => {
    const trip: Trip = { ...baseTrip, name: 'Paris, France; Weekend' };
    const result = buildTripICS(trip, []);
    expect(result).toContain('SUMMARY:🧭 Paris\\, France\\; Weekend');
  });

  it('skips reservation with no start_datetime, resulting in only 1 VEVENT (the trip)', () => {
    const noDateTime: Reservation = { ...baseReservation, start_datetime: null };
    const result = buildTripICS(baseTrip, [noDateTime]);
    // Only the trip VEVENT should be present
    const beginCount = (result.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(beginCount).toBe(1);
    expect(result).toContain('SUMMARY:🧭 Paris Adventure');
  });
});
