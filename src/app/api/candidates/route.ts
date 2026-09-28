/**
 * Server API Endpoint: POST /api/candidates
 *
 * Discovers real candidate places for a day trip using Geoapify Places v2.
 * Geocodes start and end points if strings are passed.
 * Returns structured CandidatePlace objects with metadata and diagnostics.
 * Never exposes API secrets or fabricates data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Coordinates } from '@/domain';
import {
  CandidateDiscoveryResult,
  GeoapifyGeocodingService,
  GeoapifyPlacesService,
  validateAndMapTravelMode,
} from '@/services/geoapify';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      city,
      start,
      end,
      availableTime,
      availableTripMinutes,
      budget,
      travelMode = 'drive',
      peopleCount = 1,
      interests = [],
      poolTargetSize = 16,
      bypassCache = false,
    } = body;

    if (!city || typeof city !== 'string' || !city.trim()) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'Missing or invalid "city" parameter.',
        },
        { status: 400 }
      );
    }

    if (!start || !end) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_INPUT',
          message: 'Both "start" and "end" points are required.',
        },
        { status: 400 }
      );
    }

    // Validate travel mode
    const modeValidation = validateAndMapTravelMode(travelMode);
    if (!modeValidation.isValid) {
      return NextResponse.json(
        {
          success: false,
          errorCode: modeValidation.reason,
          message: modeValidation.message,
        },
        { status: 400 }
      );
    }

    // Resolve coordinates for start and end
    const geocoding = new GeoapifyGeocodingService();
    let startCoords: Coordinates;
    let startName: string;
    let endCoords: Coordinates;
    let endName: string;

    if (typeof start === 'string') {
      const startRes = await geocoding.geocodeLocation({ city, locationText: start });
      if (!startRes.success) {
        return NextResponse.json(
          {
            success: false,
            errorCode: startRes.reason,
            message: `Starting point geocoding failed: ${startRes.message}`,
            diagnostics: startRes.diagnostics,
          },
          { status: 422 }
        );
      }
      startCoords = { lat: startRes.latitude, lng: startRes.longitude };
      startName = startRes.name;
    } else {
      startCoords = start.coordinates;
      startName = start.name || 'Start Point';
    }

    if (typeof end === 'string') {
      const endRes = await geocoding.geocodeLocation({ city, locationText: end });
      if (!endRes.success) {
        return NextResponse.json(
          {
            success: false,
            errorCode: endRes.reason,
            message: `Ending point geocoding failed: ${endRes.message}`,
            diagnostics: endRes.diagnostics,
          },
          { status: 422 }
        );
      }
      endCoords = { lat: endRes.latitude, lng: endRes.longitude };
      endName = endRes.name;
    } else {
      endCoords = end.coordinates;
      endName = end.name || 'End Point';
    }

    // Discover candidates
    const placesService = new GeoapifyPlacesService();
    const result: CandidateDiscoveryResult = await placesService.discoverCandidates({
      city,
      start: { coordinates: startCoords, name: startName },
      end: { coordinates: endCoords, name: endName },
      interests: Array.isArray(interests) ? interests : [interests],
      startTime: availableTime?.startTime,
      latestArrivalTime: availableTime?.latestArrivalTime,
      availableTripMinutes:
        typeof availableTripMinutes === 'number' ? availableTripMinutes : undefined,
      budget: budget
        ? {
            total: budget.total,
            perPerson: budget.perPerson,
            currency: budget.currency || 'INR',
          }
        : undefined,
      travelMode: modeValidation.mode,
      peopleCount: typeof peopleCount === 'number' && peopleCount > 0 ? peopleCount : 1,
      poolTargetSize: typeof poolTargetSize === 'number' ? poolTargetSize : 16,
      bypassCache: Boolean(bypassCache),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return NextResponse.json(
      {
        success: false,
        errorCode: 'CANDIDATE_DISCOVERY_ERROR',
        message: `Failed to discover candidate places: ${message}`,
      },
      { status: 500 }
    );
  }
}
