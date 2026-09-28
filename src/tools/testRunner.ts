/**
 * Test Runner for Geoapify Location & Routing Tools.
 *
 * Exercises Development Test Cases:
 * - TEST A: Normal (Hyderabad: VNR VJIET -> Hyderabad Railway Station, Mode = drive)
 * - TEST B: Directional distinction (A -> B vs B -> A)
 * - TEST C: Walking mode (same points, mode = walk)
 * - TEST D: Invalid location string -> LOCATION_NOT_FOUND
 * - TEST E: Unsupported travel mode -> UNSUPPORTED_TRAVEL_MODE
 * - TEST F: Matrix size limit protection (> 1000 cells) -> Blocks before sending
 */

import {
  GeoapifyGeocodingService,
  GeoapifyMatrixService,
  GeoapifyRoutingService,
  MAX_MATRIX_CELLS,
  validateAndMapTravelMode,
} from '@/services/geoapify';

export interface TestResultItem {
  testId: string;
  name: string;
  passed: boolean;
  notes: string;
  data?: unknown;
}

export interface FullTestReport {
  timestamp: string;
  hasApiKey: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResultItem[];
}

export async function runRoutingToolTests(): Promise<FullTestReport> {
  const results: TestResultItem[] = [];
  const geocoding = new GeoapifyGeocodingService();
  const routing = new GeoapifyRoutingService();
  const matrix = new GeoapifyMatrixService();

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  const hasApiKey = Boolean(apiKey);

  console.log('----------------------------------------------------');
  console.log('RUNNING GEOAPIFY LOCATION & ROUTING TEST SUITE');
  console.log(`GEOAPIFY_API_KEY Present: ${hasApiKey ? 'YES' : 'NO'}`);
  console.log('----------------------------------------------------');

  // -----------------------------------------------------------------
  // TEST E: Unsupported / Invalid Travel Mode (Runs offline/no API key required)
  // -----------------------------------------------------------------
  try {
    const invalidMode = 'helicopter';
    const validation = validateAndMapTravelMode(invalidMode);

    if (!validation.isValid && validation.reason === 'UNSUPPORTED_TRAVEL_MODE') {
      results.push({
        testId: 'TEST_E',
        name: 'Unsupported Travel Mode Rejection',
        passed: true,
        notes: `Correctly rejected mode "${invalidMode}" with structured reason: ${validation.reason}`,
        data: validation,
      });
    } else {
      results.push({
        testId: 'TEST_E',
        name: 'Unsupported Travel Mode Rejection',
        passed: false,
        notes: 'Failed to reject unsupported travel mode.',
      });
    }
  } catch (err: unknown) {
    results.push({
      testId: 'TEST_E',
      name: 'Unsupported Travel Mode Rejection',
      passed: false,
      notes: err instanceof Error ? err.message : 'Error during Test E',
    });
  }

  // -----------------------------------------------------------------
  // TEST F: Matrix Size Protection (Runs offline/blocks before calling API)
  // -----------------------------------------------------------------
  try {
    // Generate 35 dummy points -> 35 × 35 = 1225 cells (> 1000 max)
    const largeLocationSet = Array.from({ length: 35 }, (_, idx) => ({
      id: `loc-${idx}`,
      name: `Location ${idx}`,
      coordinates: { lat: 17.385 + idx * 0.001, lng: 78.486 + idx * 0.001 },
    }));

    let blocked = false;
    let errorMessage = '';

    try {
      await matrix.calculateRouteMatrix(largeLocationSet, 'drive');
    } catch (err: unknown) {
      blocked = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    if (blocked && errorMessage.includes(`${MAX_MATRIX_CELLS} cells`)) {
      results.push({
        testId: 'TEST_F',
        name: 'Matrix Size Protection (>1000 cells)',
        passed: true,
        notes: `Blocked request before dispatch: ${errorMessage}`,
      });
    } else {
      results.push({
        testId: 'TEST_F',
        name: 'Matrix Size Protection (>1000 cells)',
        passed: false,
        notes: `Did not block oversized matrix (blocked: ${blocked})`,
      });
    }
  } catch (err: unknown) {
    results.push({
      testId: 'TEST_F',
      name: 'Matrix Size Protection (>1000 cells)',
      passed: false,
      notes: err instanceof Error ? err.message : 'Error during Test F',
    });
  }

  // -----------------------------------------------------------------
  // If GEOAPIFY_API_KEY is missing, live tests (A, B, C, D) must fail gracefully
  // -----------------------------------------------------------------
  if (!hasApiKey) {
    const missingNotice =
      'GEOAPIFY_API_KEY is not set in .env.local. Live network tests were skipped/gracefully reported. No mock data was fabricated.';

    results.push({
      testId: 'TEST_A',
      name: 'Normal Geocoding & Drive Route (Hyderabad)',
      passed: false,
      notes: missingNotice,
    });
    results.push({
      testId: 'TEST_B',
      name: 'Directional Matrix Distinction (A -> B vs B -> A)',
      passed: false,
      notes: missingNotice,
    });
    results.push({
      testId: 'TEST_C',
      name: 'Walking Mode Road Routing',
      passed: false,
      notes: missingNotice,
    });
    results.push({
      testId: 'TEST_D',
      name: 'Invalid Location Detection',
      passed: false,
      notes: missingNotice,
    });

    const passedTests = results.filter((r) => r.passed).length;
    return {
      timestamp: new Date().toISOString(),
      hasApiKey: false,
      totalTests: results.length,
      passedTests,
      failedTests: results.length - passedTests,
      results,
    };
  }

  // -----------------------------------------------------------------
  // TEST D: Invalid Location String (Live test)
  // -----------------------------------------------------------------
  try {
    const invalidQuery = 'xyz987qwer_nonexistent_place_12345';
    const invalidRes = await geocoding.geocodeLocation({
      city: 'Hyderabad',
      locationText: invalidQuery,
    });

    if (!invalidRes.success && invalidRes.reason === 'LOCATION_NOT_FOUND') {
      results.push({
        testId: 'TEST_D',
        name: 'Invalid Location Detection',
        passed: true,
        notes: `Returned structured LOCATION_NOT_FOUND as expected. (${invalidRes.message})`,
      });
    } else {
      results.push({
        testId: 'TEST_D',
        name: 'Invalid Location Detection',
        passed: false,
        notes: `Did not return expected LOCATION_NOT_FOUND: ${JSON.stringify(invalidRes)}`,
      });
    }
  } catch (err: unknown) {
    results.push({
      testId: 'TEST_D',
      name: 'Invalid Location Detection',
      passed: false,
      notes: err instanceof Error ? err.message : 'Error during Test D',
    });
  }

  // -----------------------------------------------------------------
  // TEST A: Normal Drive Route (Hyderabad: VNR VJIET -> Hyderabad Railway Station)
  // -----------------------------------------------------------------
  let startCoords: { lat: number; lng: number; name: string } | null = null;
  let endCoords: { lat: number; lng: number; name: string } | null = null;

  try {
    const resolution = await geocoding.resolveStartAndEnd(
      'Hyderabad',
      'VNR VJIET',
      'Hyderabad Railway Station'
    );

    if (resolution.start.success && resolution.end.success) {
      startCoords = {
        name: resolution.start.name,
        lat: resolution.start.latitude,
        lng: resolution.start.longitude,
      };
      endCoords = {
        name: resolution.end.name,
        lat: resolution.end.latitude,
        lng: resolution.end.longitude,
      };

      // Calculate driving route
      const driveRoute = await routing.calculateRoute(
        { id: 'START', name: startCoords.name, coordinates: startCoords },
        { id: 'END', name: endCoords.name, coordinates: endCoords },
        'drive'
      );

      const isPositive = driveRoute.distanceMeters > 0 && driveRoute.durationSeconds > 0;
      results.push({
        testId: 'TEST_A',
        name: 'Normal Geocoding & Drive Route (Hyderabad)',
        passed: isPositive,
        notes: isPositive
          ? `Geocoded both locations and calculated drive route: ${(driveRoute.distanceMeters / 1000).toFixed(1)} km, ${driveRoute.durationMinutes} min (${driveRoute.durationSeconds}s, ${driveRoute.trafficModel})`
          : 'Drive route returned non-positive distance or duration',
        data: {
          start: resolution.start,
          end: resolution.end,
          route: driveRoute,
        },
      });
    } else {
      const startFail = !resolution.start.success ? `Start: ${resolution.start.message}` : '';
      const endFail = !resolution.end.success ? `End: ${resolution.end.message}` : '';
      results.push({
        testId: 'TEST_A',
        name: 'Normal Geocoding & Drive Route (Hyderabad)',
        passed: false,
        notes: `Could not geocode both test locations: ${[startFail, endFail].filter(Boolean).join('; ')}`,
      });
    }
  } catch (err: unknown) {
    results.push({
      testId: 'TEST_A',
      name: 'Normal Geocoding & Drive Route (Hyderabad)',
      passed: false,
      notes: err instanceof Error ? err.message : 'Error during Test A',
    });
  }

  // -----------------------------------------------------------------
  // TEST B: Directional Matrix (A -> B vs B -> A)
  // -----------------------------------------------------------------
  if (startCoords && endCoords) {
    try {
      const startPoint = { id: 'A', name: startCoords.name, coordinates: startCoords };
      const endPoint = { id: 'B', name: endCoords.name, coordinates: endCoords };

      const matrixRes = await matrix.calculateRouteMatrix([startPoint, endPoint], 'drive');

      const aToB = matrixRes.nestedMatrix['A']?.['B'];
      const bToA = matrixRes.nestedMatrix['B']?.['A'];

      if (aToB && bToA && aToB.status === 'OK' && bToA.status === 'OK') {
        results.push({
          testId: 'TEST_B',
          name: 'Directional Matrix Distinction (A -> B vs B -> A)',
          passed: true,
          notes: `A->B: ${aToB.durationMinutes}m (${(aToB.distanceMeters / 1000).toFixed(1)}km), B->A: ${bToA.durationMinutes}m (${(bToA.distanceMeters / 1000).toFixed(1)}km). Directionality preserved independently.`,
          data: {
            aToB,
            bToA,
            differentDurations: aToB.durationSeconds !== bToA.durationSeconds,
            differentDistances: aToB.distanceMeters !== bToA.distanceMeters,
          },
        });
      } else {
        results.push({
          testId: 'TEST_B',
          name: 'Directional Matrix Distinction (A -> B vs B -> A)',
          passed: false,
          notes: 'Failed to retrieve both directional legs from matrix.',
        });
      }
    } catch (err: unknown) {
      results.push({
        testId: 'TEST_B',
        name: 'Directional Matrix Distinction (A -> B vs B -> A)',
        passed: false,
        notes: err instanceof Error ? err.message : 'Error during Test B',
      });
    }
  }

  // -----------------------------------------------------------------
  // TEST C: Walking Mode (Same points, mode = walk)
  // -----------------------------------------------------------------
  if (startCoords && endCoords) {
    try {
      const walkRoute = await routing.calculateRoute(
        { id: 'START', name: startCoords.name, coordinates: startCoords },
        { id: 'END', name: endCoords.name, coordinates: endCoords },
        'walk'
      );

      results.push({
        testId: 'TEST_C',
        name: 'Walking Mode Road Routing',
        passed: true,
        notes: `Calculated walking route: ${(walkRoute.distanceMeters / 1000).toFixed(1)} km, ${walkRoute.durationMinutes} min (${walkRoute.trafficModel})`,
        data: walkRoute,
      });
    } catch (err: unknown) {
      results.push({
        testId: 'TEST_C',
        name: 'Walking Mode Road Routing',
        passed: false,
        notes: err instanceof Error ? err.message : 'Error during Test C',
      });
    }
  }

  const passedTests = results.filter((r) => r.passed).length;
  return {
    timestamp: new Date().toISOString(),
    hasApiKey: true,
    totalTests: results.length,
    passedTests,
    failedTests: results.length - passedTests,
    results,
  };
}
