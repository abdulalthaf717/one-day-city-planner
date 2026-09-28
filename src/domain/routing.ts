/**
 * Domain types for directional road routing and distance/duration matrix calculations.
 */

import { TravelMode } from './constraints';

export type TrafficModel = 'free_flow' | 'approximated' | 'not_applicable';

export type RouteStatus = 'OK' | 'NO_ROUTE' | 'ERROR';

export interface RouteSegment {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  mode: TravelMode;
  distanceMeters: number;
  durationSeconds: number;
  durationMinutes: number;
  trafficModel: TrafficModel;
  source: 'geoapify';
  /** Directional guarantee: A -> B travel time and route can differ from B -> A */
  isDirectional: true;
  geometryPolyline?: string;
  stepsSummary?: string;
}

export interface RouteMatrixElement {
  fromId: string;
  toId: string;
  distanceMeters: number;
  durationSeconds: number;
  durationMinutes: number;
  status: RouteStatus;
  mode: TravelMode;
  trafficModel: TrafficModel;
  source: 'geoapify';
}

export interface DirectionalRouteMatrix {
  mode: TravelMode;
  trafficModel: TrafficModel;
  locationIds: string[];
  cellCount: number;
  /** Flat lookup key: `${fromId}::${toId}` -> RouteMatrixElement */
  matrix: Record<string, RouteMatrixElement>;
  /** Nested lookup: nestedMatrix[fromId][toId] -> RouteMatrixElement */
  nestedMatrix: Record<string, Record<string, RouteMatrixElement>>;
  calculatedAt: string;
  cached?: boolean;
}
