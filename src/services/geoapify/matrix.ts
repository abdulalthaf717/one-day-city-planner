/**
 * Geoapify Directional Route Matrix Service.
 *
 * Requirements:
 * - Computes complete directional travel matrix (START -> A, A -> B, B -> A, A -> END, etc.).
 * - Non-symmetric matrix preserving A -> B != B -> A.
 * - CRITICAL LIMIT: Max 1000 cells (sources × targets <= 1000). Rejects before calling if exceeded.
 * - Validates travel mode against supported Geoapify modes.
 * - In-memory caching for quota efficiency.
 */

import { Coordinates, DirectionalRouteMatrix, RouteMatrixElement, TravelMode } from '@/domain';
import { RouteCache } from './cache';
import { GeoapifyClient } from './client';
import { validateAndMapTravelMode } from './travelModes';
import { GeoapifyRouteMatrixResponse } from './types';

export const MAX_MATRIX_CELLS = 1000;

export interface IGeoapifyMatrixService {
  calculateRouteMatrix(
    locations: Array<{ id: string; name: string; coordinates: Coordinates }>,
    mode: TravelMode | string
  ): Promise<DirectionalRouteMatrix>;
}

export class GeoapifyMatrixService extends GeoapifyClient implements IGeoapifyMatrixService {
  private cache = RouteCache.getInstance();

  async calculateRouteMatrix(
    locations: Array<{ id: string; name: string; coordinates: Coordinates }>,
    mode: TravelMode | string
  ): Promise<DirectionalRouteMatrix> {
    // 1. Travel mode validation
    const modeValidation = validateAndMapTravelMode(mode);
    if (!modeValidation.isValid) {
      throw new Error(modeValidation.message);
    }
    const { mode: validMode, apiMode, trafficModel } = modeValidation;

    // 2. Cell count protection (sources × targets <= 1000)
    const count = locations.length;
    const cellCount = count * count;

    if (cellCount > MAX_MATRIX_CELLS) {
      throw new Error(
        `Matrix request exceeds Geoapify limit of ${MAX_MATRIX_CELLS} cells (${count} locations = ${cellCount} cells). Please reduce the number of candidate stops to 31 or fewer.`
      );
    }

    if (count === 0) {
      return {
        mode: validMode,
        trafficModel,
        locationIds: [],
        cellCount: 0,
        matrix: {},
        nestedMatrix: {},
        calculatedAt: new Date().toISOString(),
      };
    }

    // 3. Cache lookup
    const cacheKey = this.cache.makeMatrixKey(
      locations.map((l) => l.coordinates),
      validMode,
      trafficModel
    );

    const cached = this.cache.get<DirectionalRouteMatrix>(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    // 4. API Request
    const apiKey = this.ensureApiKey();
    const url = `${this.baseUrl}/v1/routematrix?apiKey=${apiKey}`;

    // Geoapify expects [lon, lat] pairs
    const locationPoints = locations.map((loc) => ({
      location: [loc.coordinates.lng, loc.coordinates.lat],
    }));

    const body = {
      mode: apiMode,
      sources: locationPoints,
      targets: locationPoints,
    };

    const data = await this.fetchJson<GeoapifyRouteMatrixResponse>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const flatMatrix: Record<string, RouteMatrixElement> = {};
    const nestedMatrix: Record<string, Record<string, RouteMatrixElement>> = {};
    const rows = data.sources_to_targets || [];

    for (let sIdx = 0; sIdx < locations.length; sIdx++) {
      const from = locations[sIdx];
      const fromId = from.id || (from as unknown as { placeId?: string }).placeId || `loc_${sIdx}`;
      nestedMatrix[fromId] = {};

      const row = rows[sIdx] || [];

      for (let tIdx = 0; tIdx < locations.length; tIdx++) {
        const to = locations[tIdx];
        const toId = to.id || (to as unknown as { placeId?: string }).placeId || `loc_${tIdx}`;
        const item = row[tIdx];
        const flatKey = `${fromId}::${toId}`;

        if (!item || item.time === null || item.distance === null) {
          const element: RouteMatrixElement = {
            fromId,
            toId,
            distanceMeters: 0,
            durationSeconds: 0,
            durationMinutes: 0,
            status: 'NO_ROUTE',
            mode: validMode,
            trafficModel,
            source: 'geoapify',
          };
          flatMatrix[flatKey] = element;
          nestedMatrix[fromId][toId] = element;
        } else {
          const durationSeconds = Math.round(item.time);
          const durationMinutes = Math.ceil(durationSeconds / 60);

          const element: RouteMatrixElement = {
            fromId,
            toId,
            distanceMeters: Math.round(item.distance),
            durationSeconds,
            durationMinutes,
            status: 'OK',
            mode: validMode,
            trafficModel,
            source: 'geoapify',
          };
          flatMatrix[flatKey] = element;
          nestedMatrix[fromId][toId] = element;
        }
      }
    }

    const result: DirectionalRouteMatrix = {
      mode: validMode,
      trafficModel,
      locationIds: locations.map((l) => l.id),
      cellCount,
      matrix: flatMatrix,
      nestedMatrix,
      calculatedAt: new Date().toISOString(),
    };

    // Store in cache
    this.cache.set(cacheKey, result);

    return result;
  }
}
