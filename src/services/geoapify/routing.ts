/**
 * Geoapify Directional Routing Service.
 *
 * Core Principles:
 * - Directional routing: A -> B and B -> A are calculated independently.
 * - Road-network based, travel mode sensitive (drive, walk, bicycle, transit).
 * - Honest traffic semantics: exposes trafficModel ('approximated' vs 'not_applicable').
 * - In-memory caching for quota protection.
 */

import { Coordinates, RouteSegment, TravelMode } from '@/domain';
import { RouteCache } from './cache';
import { GeoapifyClient } from './client';
import { validateAndMapTravelMode } from './travelModes';
import { GeoapifyRoutingResponse } from './types';

export interface IGeoapifyRoutingService {
  calculateRoute(
    from: { id: string; name: string; coordinates: Coordinates },
    to: { id: string; name: string; coordinates: Coordinates },
    mode: TravelMode | string
  ): Promise<RouteSegment>;
}

export class GeoapifyRoutingService extends GeoapifyClient implements IGeoapifyRoutingService {
  private cache = RouteCache.getInstance();

  async calculateRoute(
    from: { id: string; name: string; coordinates: Coordinates },
    to: { id: string; name: string; coordinates: Coordinates },
    mode: TravelMode | string
  ): Promise<RouteSegment> {
    const modeValidation = validateAndMapTravelMode(mode);
    if (!modeValidation.isValid) {
      throw new Error(modeValidation.message);
    }

    const { mode: validMode, apiMode, trafficModel } = modeValidation;

    // Check in-memory cache
    const cacheKey = this.cache.makeRouteKey(
      from.coordinates.lat,
      from.coordinates.lng,
      to.coordinates.lat,
      to.coordinates.lng,
      validMode,
      trafficModel
    );

    const cached = this.cache.get<RouteSegment>(cacheKey);
    if (cached) {
      return cached;
    }

    const apiKey = this.ensureApiKey();
    // Geoapify expects waypoints as lat,lon|lat,lon
    const waypoints = `${from.coordinates.lat},${from.coordinates.lng}|${to.coordinates.lat},${to.coordinates.lng}`;
    const url = new URL(`${this.baseUrl}/v1/routing`);
    url.searchParams.set('waypoints', waypoints);
    url.searchParams.set('mode', apiMode);
    url.searchParams.set('apiKey', apiKey);

    const data = await this.fetchJson<GeoapifyRoutingResponse>(url.toString());
    const feature = data.features?.[0];

    if (!feature) {
      throw new Error(`No route found between "${from.name}" and "${to.name}" for mode ${validMode}`);
    }

    const distanceMeters = feature.properties.distance || 0;
    const durationSeconds = feature.properties.time || 0;
    const durationMinutes = Math.ceil(durationSeconds / 60);

    const segment: RouteSegment = {
      fromId: from.id,
      toId: to.id,
      fromName: from.name,
      toName: to.name,
      mode: validMode,
      distanceMeters,
      durationSeconds,
      durationMinutes,
      trafficModel,
      source: 'geoapify',
      isDirectional: true,
      geometryPolyline: feature.geometry?.coordinates
        ? JSON.stringify(feature.geometry.coordinates)
        : undefined,
    };

    // Store in cache
    this.cache.set(cacheKey, segment);

    return segment;
  }
}
