/**
 * Geographic Planning Corridor & Spatial Filter.
 *
 * Defines the geographic search corridor between user start and end coordinates.
 * Prevents pulling places outside feasible travel range while allowing a configurable margin.
 */

import { Coordinates } from '@/domain';

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface PlanningCorridor {
  boundingBox: BoundingBox;
  center: Coordinates;
  spanKm: number;
  filterString: string; // e.g. "rect:minLon,minLat,maxLon,maxLat"
  biasString: string; // e.g. "proximity:lon,lat"
}

// 1 degree latitude ~= 111 km
const KM_PER_LAT_DEGREE = 111.0;

/**
 * Calculates Great-Circle distance in meters using the Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Builds a geographic corridor between start and end coordinates.
 *
 * @param start Starting point coordinates
 * @param end Ending point coordinates
 * @param marginKm Configurable margin around the direct bounding box (default: 4.0 km)
 * @param minSpanKm Minimum corridor dimension in km (default: 12.0 km)
 */
export function buildPlanningCorridor(
  start: Coordinates,
  end: Coordinates,
  marginKm: number = 4.0,
  minSpanKm: number = 12.0
): PlanningCorridor {
  const directDistanceMeters = calculateHaversineDistance(
    start.lat,
    start.lng,
    end.lat,
    end.lng
  );
  const directDistanceKm = directDistanceMeters / 1000;

  // Approximate km per longitude degree at this latitude
  const midLat = (start.lat + end.lat) / 2;
  const kmPerLonDegree = KM_PER_LAT_DEGREE * Math.cos((midLat * Math.PI) / 180);

  // Determine span in km; if start & end are close (or identical), ensure at least minSpanKm
  const latDeltaKm = Math.abs(start.lat - end.lat) * KM_PER_LAT_DEGREE;
  const lonDeltaKm = Math.abs(start.lng - end.lng) * kmPerLonDegree;

  const effectiveMarginLatKm = Math.max(marginKm, (minSpanKm - latDeltaKm) / 2);
  const effectiveMarginLonKm = Math.max(marginKm, (minSpanKm - lonDeltaKm) / 2);

  const latMarginDeg = effectiveMarginLatKm / KM_PER_LAT_DEGREE;
  const lonMarginDeg = effectiveMarginLonKm / (kmPerLonDegree || 1);

  const minLat = Math.min(start.lat, end.lat) - latMarginDeg;
  const maxLat = Math.max(start.lat, end.lat) + latMarginDeg;
  const minLon = Math.min(start.lng, end.lng) - lonMarginDeg;
  const maxLon = Math.max(start.lng, end.lng) + lonMarginDeg;

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  // Round to 5 decimal places for stable caching and Geoapify queries
  const round5 = (n: number) => Math.round(n * 100000) / 100000;

  const rMinLon = round5(minLon);
  const rMinLat = round5(minLat);
  const rMaxLon = round5(maxLon);
  const rMaxLat = round5(maxLat);
  const rCenterLon = round5(centerLon);
  const rCenterLat = round5(centerLat);

  return {
    boundingBox: {
      minLon: rMinLon,
      minLat: rMinLat,
      maxLon: rMaxLon,
      maxLat: rMaxLat,
    },
    center: {
      lat: rCenterLat,
      lng: rCenterLon,
    },
    spanKm: Math.max(directDistanceKm, minSpanKm),
    filterString: `rect:${rMinLon},${rMinLat},${rMaxLon},${rMaxLat}`,
    biasString: `proximity:${rCenterLon},${rCenterLat}`,
  };
}

/**
 * Checks whether a candidate coordinate falls strictly within the corridor bounding box.
 */
export function isWithinCorridor(coords: Coordinates, corridor: PlanningCorridor): boolean {
  const { minLon, minLat, maxLon, maxLat } = corridor.boundingBox;
  return (
    coords.lat >= minLat &&
    coords.lat <= maxLat &&
    coords.lng >= minLon &&
    coords.lng <= maxLon
  );
}

/**
 * Calculates the perpendicular detour distance (in km) of a point from the direct line connecting start and end.
 * If start and end are identical or very close, returns the straight-line distance from start.
 */
export function calculateDetourDistanceKm(
  point: Coordinates,
  start: Coordinates,
  end: Coordinates
): number {
  const lineDistKm = calculateHaversineDistance(start.lat, start.lng, end.lat, end.lng) / 1000;
  const dStartKm = calculateHaversineDistance(start.lat, start.lng, point.lat, point.lng) / 1000;
  const dEndKm = calculateHaversineDistance(end.lat, end.lng, point.lat, point.lng) / 1000;

  if (lineDistKm < 0.5) {
    return dStartKm;
  }

  // Detour is excess travel: (dist(start, P) + dist(P, end)) - dist(start, end)
  const excessKm = dStartKm + dEndKm - lineDistKm;
  return Math.max(0, excessKm);
}
