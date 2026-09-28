/**
 * Domain types for trip constraints and user inputs.
 */

export type TravelMode = 'drive' | 'walk' | 'bicycle' | 'transit';

export type TravelPreference =
  | 'food'
  | 'history'
  | 'nature'
  | 'shopping'
  | 'architecture'
  | 'entertainment'
  | 'photography'
  | 'religious'
  | 'family'
  | string;

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LocationPoint {
  name: string;
  address?: string;
  coordinates: Coordinates;
  placeId?: string;
  type?: 'address' | 'hotel' | 'airport' | 'station' | 'attraction' | 'home' | 'custom' | 'other';
}

export interface TimeConstraint {
  /** Date of trip in YYYY-MM-DD format */
  date: string;
  /** Start time of day in 24-hr format (e.g., "09:00") */
  startTime: string;
  /** Required latest arrival time at end point in 24-hr format (e.g., "19:00") */
  latestArrivalTime: string;
}

export interface BudgetConstraint {
  total: number;
  currency: string;
}

export type TripPace = 'relaxed' | 'moderate' | 'packed';

export interface TripConstraints {
  city: string;
  startingPoint: LocationPoint;
  endPoint: LocationPoint;
  time: TimeConstraint;
  budget: BudgetConstraint;
  travelMode: TravelMode;
  numberOfPeople: number;
  interests: string[];
  pace?: TripPace;
}
