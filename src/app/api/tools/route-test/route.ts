/**
 * API Route: /api/tools/route-test
 *
 * Dedicated server-side test endpoint to verify:
 * 1. Start & End point geocoding
 * 2. Direct route calculation
 * 3. Directional 2x2 Route Matrix (Start -> End vs End -> Start)
 * 4. Mode validation & matrix size bounds
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  GeoapifyGeocodingService,
  GeoapifyMatrixService,
  GeoapifyRoutingService,
  validateAndMapTravelMode,
} from '@/services/geoapify';

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { city, start, end, travelMode = 'drive' } = body;

    if (!city || !city.trim()) {
      return NextResponse.json(
        { success: false, reason: 'INVALID_INPUT', message: 'City is required.' },
        { status: 400 }
      );
    }

    if (!start || !start.trim() || !end || !end.trim()) {
      return NextResponse.json(
        {
          success: false,
          reason: 'INVALID_INPUT',
          message: 'Both start and end location texts are required.',
        },
        { status: 400 }
      );
    }

    // 1. Validate Travel Mode
    const modeValidation = validateAndMapTravelMode(travelMode);
    if (!modeValidation.isValid) {
      return NextResponse.json(
        {
          success: false,
          reason: modeValidation.reason,
          message: modeValidation.message,
        },
        { status: 400 }
      );
    }

    // 2. Geocoding Service
    const geocodingService = new GeoapifyGeocodingService();
    const resolution = await geocodingService.resolveStartAndEnd(city, start, end);

    if (!resolution.start.success) {
      return NextResponse.json(
        {
          success: false,
          reason: resolution.start.reason,
          message: `Failed to resolve starting point: ${resolution.start.message}`,
          location: 'start',
          details: resolution.start,
        },
        { status: 422 }
      );
    }

    if (!resolution.end.success) {
      return NextResponse.json(
        {
          success: false,
          reason: resolution.end.reason,
          message: `Failed to resolve ending point: ${resolution.end.message}`,
          location: 'end',
          details: resolution.end,
        },
        { status: 422 }
      );
    }

    const startLoc = resolution.start;
    const endLoc = resolution.end;

    const startPoint = {
      id: 'START',
      name: startLoc.name,
      coordinates: { lat: startLoc.latitude, lng: startLoc.longitude },
    };

    const endPoint = {
      id: 'END',
      name: endLoc.name,
      coordinates: { lat: endLoc.latitude, lng: endLoc.longitude },
    };

    // 3. Direct Route (Start -> End)
    const routingService = new GeoapifyRoutingService();
    const directRoute = await routingService.calculateRoute(
      startPoint,
      endPoint,
      modeValidation.mode
    );

    // 4. Directional Route Matrix (2x2: START, END)
    const matrixService = new GeoapifyMatrixService();
    const routeMatrix = await matrixService.calculateRouteMatrix(
      [startPoint, endPoint],
      modeValidation.mode
    );

    // 5. Compare A -> B vs B -> A
    const aToB = routeMatrix.matrix['START::END'];
    const bToA = routeMatrix.matrix['END::START'];

    const directionalComparison = {
      startToEnd: {
        distanceMeters: aToB?.distanceMeters ?? 0,
        durationSeconds: aToB?.durationSeconds ?? 0,
        durationMinutes: aToB?.durationMinutes ?? 0,
      },
      endToStart: {
        distanceMeters: bToA?.distanceMeters ?? 0,
        durationSeconds: bToA?.durationSeconds ?? 0,
        durationMinutes: bToA?.durationMinutes ?? 0,
      },
      isIdenticalDuration:
        aToB?.durationSeconds !== undefined &&
        bToA?.durationSeconds !== undefined &&
        aToB.durationSeconds === bToA.durationSeconds,
      isIdenticalDistance:
        aToB?.distanceMeters !== undefined &&
        bToA?.distanceMeters !== undefined &&
        aToB.distanceMeters === bToA.distanceMeters,
      differenceMinutes:
        aToB && bToA ? Math.abs(aToB.durationMinutes - bToA.durationMinutes) : 0,
    };

    const totalElapsedMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      city,
      travelMode: modeValidation.mode,
      trafficModel: modeValidation.trafficModel,
      trafficModelSemantic: modeValidation.semanticLabel,
      startLocation: {
        formattedAddress: startLoc.formattedAddress,
        latitude: startLoc.latitude,
        longitude: startLoc.longitude,
        source: startLoc.source,
      },
      endLocation: {
        formattedAddress: endLoc.formattedAddress,
        latitude: endLoc.latitude,
        longitude: endLoc.longitude,
        source: endLoc.source,
      },
      directRoute: {
        distanceMeters: directRoute.distanceMeters,
        durationSeconds: directRoute.durationSeconds,
        durationMinutes: directRoute.durationMinutes,
        trafficModel: directRoute.trafficModel,
        isDirectional: directRoute.isDirectional,
      },
      directionalComparison,
      routeMatrix: {
        cellCount: routeMatrix.cellCount,
        cached: routeMatrix.cached || false,
        nested: routeMatrix.nestedMatrix,
      },
      diagnostics: {
        totalElapsedMs,
        cached: routeMatrix.cached || false,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown tool error';
    return NextResponse.json(
      {
        success: false,
        reason: 'ROUTING_FAILED',
        message: msg,
      },
      { status: 500 }
    );
  }
}
