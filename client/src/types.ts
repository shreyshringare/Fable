export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export type Role = 'owner' | 'editor' | 'viewer';

export interface Trip {
  id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string;
  created_at: string;
  role?: Role;
  member_count?: number;
}

export interface Member extends User {
  role: Role;
}

export interface Day {
  id: string;
  trip_id: string;
  date: string;
  notes: string | null;
}

export interface Place {
  id: string;
  day_id: string;
  trip_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  category: string;
  notes: string | null;
  order_index: number;
  photo_url: string | null;
  rating: number | null;
  hours: string | null;
  website: string | null;
}

export interface DayNote {
  id: string;
  day_id: string;
  content: string;
  icon: string | null;
  timestamp: string;
  order_index: number;
}

export interface Reservation {
  id: string;
  trip_id: string;
  type: 'flight' | 'accommodation' | 'restaurant' | 'transport';
  title: string;
  confirmation_number: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  status: string;
  notes: string | null;
  cost: number | null;
  attachment_url: string | null;
}

export interface BudgetItem {
  id: string;
  trip_id: string;
  category: string;
  label: string;
  amount: number;
  currency: string;
  paid_by_user_id: string | null;
  split_among: string[];
  created_at: string;
}

export interface PackingItem {
  id: string;
  trip_id: string;
  label: string;
  category: string;
  quantity: number;
  packed: boolean;
  assigned_to_user_id: string | null;
}

export interface Message {
  id: string;
  trip_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string | null;
}

export interface LoreFact {
  source_title: string;
  heading: string;
  text: string;
  url: string;
}

export interface LoreResult {
  query: string;
  about: string | null;
  image: string | null;
  official_website: string | null;
  facts: LoreFact[];
}

export interface TripDetail {
  trip: Trip;
  members: Member[];
  days: Day[];
  places: Place[];
  notes: DayNote[];
}

export interface WsEvent {
  type: string;
  tripId: string;
  payload: any;
}
