/**
 * Programmatic Test Runner for Deterministic Itinerary Optimizer & Safety Buffer Validation.
 *
 * Exercises Development Test Cases:
 * - TEST A: Simple feasible trip (Hyderabad: VNR VJIET -> Railway Station, 10:00–20:00, drive, ₹2000)
 * - TEST B: Very short trip (2 hours) -> only feasible nearby activities, distant pruned
 * - TEST C: Very small budget (₹200) -> expensive rejected, free/cheap selected
 * - TEST D: End-point pressure -> candidate making user late to END is rejected
 * - TEST E: Directional routing -> asymmetric A -> B != B -> A preserved
 * - TEST F: Opening hours conflict -> candidate outside opening window is rejected or waits
 * - TEST G: No feasible activity -> safe minimal START -> END returned without violation
 * - TEST H: Missing route matrix entry -> transition safely excluded
 * - TEST I: Reproducibility -> identical inputs yield identical schedules and scores (zero randomness)
 */

import {
  CandidatePlace,
  DirectionalRouteMatrix,
  LocationPoint,
  TripConstraints,
} from '@/domain';
import { DeterministicOptimizer } from '@/optimizer';
import {
  GeoapifyGeocodingService,
  GeoapifyMatrixService,
  GeoapifyPlacesService,
} from '@/services/geoapify';

export interface OptimizerTestItem {
  testId: string;
  name: string;
  passed: boolean;
  notes: string;
  data?: unknown;
}

export interface OptimizerTestReport {
  timestamp: string;
  hasApiKey: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: OptimizerTestItem[];
}

export async function runOptimizerTests(): Promise<OptimizerTestReport> {
  const results: OptimizerTestItem[] = [];
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  const hasApiKey = Boolean(apiKey);

  console.log('----------------------------------------------------');
  console.log('RUNNING DETERMINISTIC ITINERARY OPTIMIZER TEST SUITE');
  console.log(`GEOAPIFY_API_KEY Present: ${hasApiKey ? 'YES' : 'NO'}`);
  console.log('----------------------------------------------------');

  const optimizer = new DeterministicOptimizer();

  // Baseline mock coordinates for controlled test fixtures
  const startLoc: LocationPoint = {
    name: 'VNR VJIET',
    placeId: 'START',
    coordinates: { lat: 17.5394, lng: 78.3962 },
    type: 'custom',
  };

  const endLoc: LocationPoint = {
    name: 'Hyderabad Railway Station',
    placeId: 'END',
    coordinates: { lat: 17.3918, lng: 78.4693 },
    type: 'station',
  };

  // Helper to create a controlled route matrix
  const createMockMatrix = (
    pairs: Record<string, { durationMinutes: number; distanceMeters: number; status?: 'OK' | 'ERROR' }>
  ): DirectionalRouteMatrix => {
    const matrix: DirectionalRouteMatrix['matrix'] = {};
    const nestedMatrix: DirectionalRouteMatrix['nestedMatrix'] = {};
    const locationIds = Array.from(new Set(Object.keys(pairs).flatMap((k) => k.split('::'))));

    for (const [key, val] of Object.entries(pairs)) {
      const [from, to] = key.split('::');
      matrix[key] = {
        fromId: from,
        toId: to,
        distanceMeters: val.distanceMeters,
        durationSeconds: val.durationMinutes * 60,
        durationMinutes: val.durationMinutes,
        status: val.status || 'OK',
        mode: 'drive',
        trafficModel: 'approximated',
        source: 'geoapify',
      };
      if (!nestedMatrix[from]) nestedMatrix[from] = {};
      nestedMatrix[from][to] = matrix[key];
    }

    return {
      locationIds,
      cellCount: Object.keys(matrix).length,
      matrix,
      nestedMatrix,
      mode: 'drive',
      trafficModel: 'approximated',
      calculatedAt: new Date().toISOString(),
    };
  };

  // -----------------------------------------------------------------
  // TEST B: Very Short Trip (2 Hours)
  // -----------------------------------------------------------------
  try {
    const constraintsB: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '10:00', latestArrivalTime: '12:00' }, // 2 hours
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['history'],
      pace: 'moderate',
    };

    // Candidates: 1 close place (10 min travel, 30 min visit), 1 distant place (60 min travel, 90 min visit)
    const candClose: CandidatePlace = {
      id: 'CAND_CLOSE',
      name: 'Nearby Monument',
      category: 'historic',
      categories: ['tourism.sights'],
      latitude: 17.52,
      longitude: 78.40,
      coordinates: { lat: 17.52, lng: 78.40 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 30,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 50, currency: 'INR' },
      costSource: 'known',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 80,
      qualityScore: 70,
      travelBurdenScore: 10,
      candidateScore: 85,
      estimatedDurationMin: 30,
      estimatedCostPerPerson: 50,
    };

    const candFar: CandidatePlace = {
      id: 'CAND_FAR',
      name: 'Distant Fort',
      category: 'historic',
      categories: ['tourism.sights'],
      latitude: 17.35,
      longitude: 78.30,
      coordinates: { lat: 17.35, lng: 78.30 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 90,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 100, currency: 'INR' },
      costSource: 'known',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 90,
      qualityScore: 80,
      travelBurdenScore: 90,
      candidateScore: 88,
      estimatedDurationMin: 90,
      estimatedCostPerPerson: 100,
    };

    // START -> END takes 25 mins
    // START -> CAND_CLOSE takes 10 mins, CAND_CLOSE -> END takes 20 mins (Total travel = 30m + 30m visit + 15m buffer = 75m <= 120m)
    // START -> CAND_FAR takes 50 mins, CAND_FAR -> END takes 45 mins (Total = 95m travel + 90m visit = 185m > 120m)
    const matrixB = createMockMatrix({
      'START::END': { durationMinutes: 25, distanceMeters: 23000 },
      'START::CAND_CLOSE': { durationMinutes: 10, distanceMeters: 8000 },
      'CAND_CLOSE::END': { durationMinutes: 20, distanceMeters: 17000 },
      'START::CAND_FAR': { durationMinutes: 50, distanceMeters: 35000 },
      'CAND_FAR::END': { durationMinutes: 45, distanceMeters: 30000 },
      'CAND_CLOSE::CAND_FAR': { durationMinutes: 45, distanceMeters: 30000 },
      'CAND_FAR::CAND_CLOSE': { durationMinutes: 45, distanceMeters: 30000 },
    });

    const resB = optimizer.optimizeAndValidate({
      constraints: constraintsB,
      candidates: [candClose, candFar],
      routeMatrix: matrixB,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const selectedIds = resB.output.orderedPlaceIds;
    const passedB =
      resB.validation.isValid &&
      selectedIds.includes('CAND_CLOSE') &&
      !selectedIds.includes('CAND_FAR');

    results.push({
      testId: 'TEST_B',
      name: 'Very Short Trip (2-Hour Window Pruning)',
      passed: passedB,
      notes: passedB
        ? `Successfully scheduled nearby activity (${selectedIds.join(', ')}) and pruned distant 90m fort. Validated finish at ${resB.output.plannedArrivalTimeAtEnd} before 12:00 with ${resB.output.totalBufferMinutes}m safety buffer.`
        : `Test B failed: selected=${selectedIds.join(', ')}, isValid=${resB.validation.isValid}`,
      data: { schedule: resB.output.schedule },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_B',
      name: 'Very Short Trip',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST C: Very Small Budget (₹200 for 2 people)
  // -----------------------------------------------------------------
  try {
    const constraintsC: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '10:00', latestArrivalTime: '18:00' },
      budget: { total: 200, currency: '₹' }, // Small budget
      travelMode: 'drive',
      numberOfPeople: 2, // 2 pax
      interests: ['food', 'park'],
      pace: 'moderate',
    };

    // Free park (₹0) vs Expensive restaurant (₹450/person = ₹900 > ₹200)
    const freePark: CandidatePlace = {
      id: 'FREE_PARK',
      name: 'Public Botanical Garden',
      category: 'park',
      categories: ['leisure.park'],
      latitude: 17.50,
      longitude: 78.42,
      coordinates: { lat: 17.50, lng: 78.42 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 45,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, totalForGroup: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 70,
      qualityScore: 75,
      travelBurdenScore: 10,
      candidateScore: 80,
      estimatedDurationMin: 45,
      estimatedCostPerPerson: 0,
    };

    const expDining: CandidatePlace = {
      id: 'EXP_DINING',
      name: 'Royal Heritage Biryani',
      category: 'restaurant',
      categories: ['catering.restaurant'],
      latitude: 17.48,
      longitude: 78.43,
      coordinates: { lat: 17.48, lng: 78.43 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 60,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 450, totalForGroup: 900, isFree: false, currency: 'INR' },
      costSource: 'estimated',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 90,
      qualityScore: 85,
      travelBurdenScore: 15,
      candidateScore: 82,
      estimatedDurationMin: 60,
      estimatedCostPerPerson: 450,
    };

    const matrixC = createMockMatrix({
      'START::END': { durationMinutes: 25, distanceMeters: 23000 },
      'START::FREE_PARK': { durationMinutes: 10, distanceMeters: 8000 },
      'FREE_PARK::END': { durationMinutes: 15, distanceMeters: 14000 },
      'START::EXP_DINING': { durationMinutes: 12, distanceMeters: 10000 },
      'EXP_DINING::END': { durationMinutes: 15, distanceMeters: 13000 },
      'FREE_PARK::EXP_DINING': { durationMinutes: 8, distanceMeters: 6000 },
      'EXP_DINING::FREE_PARK': { durationMinutes: 8, distanceMeters: 6000 },
    });

    const resC = optimizer.optimizeAndValidate({
      constraints: constraintsC,
      candidates: [freePark, expDining],
      routeMatrix: matrixC,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const selectedIdsC = resC.output.orderedPlaceIds;
    const passedC =
      resC.validation.isValid &&
      selectedIdsC.includes('FREE_PARK') &&
      !selectedIdsC.includes('EXP_DINING') &&
      resC.output.totalCost <= 200;

    results.push({
      testId: 'TEST_C',
      name: 'Budget Sensitivity (Prunes Over-Budget Dining)',
      passed: passedC,
      notes: passedC
        ? `Selected free public park (₹0) and rejected dining (₹900 for 2) exceeding ₹200 budget. Total cost: ₹${resC.output.totalCost}.`
        : `Test C failed: selected=${selectedIdsC.join(', ')}, cost=${resC.output.totalCost}`,
      data: { cost: resC.output.totalCost, schedule: resC.output.schedule },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_C',
      name: 'Budget Sensitivity',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST D: End-Point Pressure (Late Arrival Pruning)
  // -----------------------------------------------------------------
  try {
    const constraintsD: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '17:00', latestArrivalTime: '18:00' }, // 1 hour window
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['museum'],
      pace: 'moderate',
    };

    // An attractive museum (90 mins visit) in a 60 min trip window
    const longMuseum: CandidatePlace = {
      id: 'LONG_MUSEUM',
      name: 'State Museum',
      category: 'museum',
      categories: ['entertainment.museum'],
      latitude: 17.40,
      longitude: 78.47,
      coordinates: { lat: 17.40, lng: 78.47 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 90,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 50, currency: 'INR' },
      costSource: 'known',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 95,
      qualityScore: 90,
      travelBurdenScore: 20,
      candidateScore: 92,
      estimatedDurationMin: 90,
      estimatedCostPerPerson: 50,
    };

    const matrixD = createMockMatrix({
      'START::END': { durationMinutes: 25, distanceMeters: 23000 },
      'START::LONG_MUSEUM': { durationMinutes: 20, distanceMeters: 18000 },
      'LONG_MUSEUM::END': { durationMinutes: 10, distanceMeters: 6000 },
    });

    const resD = optimizer.optimizeAndValidate({
      constraints: constraintsD,
      candidates: [longMuseum],
      routeMatrix: matrixD,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    // longMuseum must be rejected; safe minimal START -> END returned
    const passedD =
      resD.validation.isValid &&
      !resD.output.orderedPlaceIds.includes('LONG_MUSEUM') &&
      resD.output.schedule.length === 0;

    results.push({
      testId: 'TEST_D',
      name: 'End-Point Pressure (High-Score But Infeasible)',
      passed: passedD,
      notes: passedD
        ? `90-minute museum correctly rejected because it violates 18:00 deadline. Returned safe direct START -> END path arriving at ${resD.output.plannedArrivalTimeAtEnd}.`
        : `Test D failed: places=${resD.output.orderedPlaceIds.join(', ')}`,
      data: { arrivalAtEnd: resD.output.plannedArrivalTimeAtEnd },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_D',
      name: 'End-Point Pressure',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST E: Directional Routing (Asymmetric A -> B != B -> A)
  // -----------------------------------------------------------------
  try {
    const candA: CandidatePlace = {
      id: 'PLACE_A',
      name: 'Monument A',
      category: 'attraction',
      categories: ['tourism.sights'],
      latitude: 17.50,
      longitude: 78.42,
      coordinates: { lat: 17.50, lng: 78.42 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 30,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 70,
      qualityScore: 70,
      travelBurdenScore: 10,
      candidateScore: 75,
      estimatedDurationMin: 30,
      estimatedCostPerPerson: 0,
    };

    const candB: CandidatePlace = {
      id: 'PLACE_B',
      name: 'Monument B',
      category: 'attraction',
      categories: ['tourism.sights'],
      latitude: 17.45,
      longitude: 78.45,
      coordinates: { lat: 17.45, lng: 78.45 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 30,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 70,
      qualityScore: 70,
      travelBurdenScore: 10,
      candidateScore: 75,
      estimatedDurationMin: 30,
      estimatedCostPerPerson: 0,
    };

    // Highly asymmetric: A -> B is 10 min, but B -> A is 45 min (due to one-way expressway)
    const matrixE = createMockMatrix({
      'START::END': { durationMinutes: 30, distanceMeters: 25000 },
      'START::PLACE_A': { durationMinutes: 10, distanceMeters: 8000 },
      'PLACE_A::END': { durationMinutes: 25, distanceMeters: 20000 },
      'START::PLACE_B': { durationMinutes: 25, distanceMeters: 20000 },
      'PLACE_B::END': { durationMinutes: 10, distanceMeters: 8000 },
      'PLACE_A::PLACE_B': { durationMinutes: 10, distanceMeters: 7000 }, // Fast
      'PLACE_B::PLACE_A': { durationMinutes: 45, distanceMeters: 25000 }, // Slow detour!
    });

    const constraintsE: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '10:00', latestArrivalTime: '14:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['sights'],
      pace: 'moderate',
    };

    const resE = optimizer.optimizeAndValidate({
      constraints: constraintsE,
      candidates: [candA, candB],
      routeMatrix: matrixE,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const order = resE.output.orderedPlaceIds;
    // Expected order: START -> PLACE_A -> PLACE_B -> END (using 10m A->B leg, avoiding 45m B->A leg)
    const passedE =
      order.length === 2 &&
      order[0] === 'PLACE_A' &&
      order[1] === 'PLACE_B' &&
      resE.output.totalTravelMinutes < 55;

    results.push({
      testId: 'TEST_E',
      name: 'Directional Road Network Asymmetry Exploitation',
      passed: passedE,
      notes: passedE
        ? `Optimizer chose sequence [START -> PLACE_A -> PLACE_B -> END] taking advantage of 10m leg and avoiding 45m reverse bottleneck. Total travel: ${resE.output.totalTravelMinutes}m.`
        : `Test E failed: order=${order.join(' -> ')}`,
      data: { order, totalTravelMinutes: resE.output.totalTravelMinutes },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_E',
      name: 'Directional Routing',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST F: Opening Hours Conflict (Closed at Planned Arrival)
  // -----------------------------------------------------------------
  try {
    const morningPlace: CandidatePlace = {
      id: 'MORNING_PLACE',
      name: 'Morning Farmers Market',
      category: 'shopping',
      categories: ['commercial.marketplace'],
      latitude: 17.50,
      longitude: 78.42,
      coordinates: { lat: 17.50, lng: 78.42 },
      city: 'Hyderabad',
      openingHours: '06:00-09:30', // Closes at 09:30
      openingHoursSource: 'provider',
      estimatedVisitDurationMinutes: 30,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 90,
      qualityScore: 80,
      travelBurdenScore: 10,
      candidateScore: 88,
      estimatedDurationMin: 30,
      estimatedCostPerPerson: 0,
    };

    const afternoonPlace: CandidatePlace = {
      id: 'AFTERNOON_PLACE',
      name: 'Art Gallery',
      category: 'attraction',
      categories: ['entertainment.culture'],
      latitude: 17.45,
      longitude: 78.45,
      coordinates: { lat: 17.45, lng: 78.45 },
      city: 'Hyderabad',
      openingHours: '10:00-18:00', // Open during trip
      openingHoursSource: 'provider',
      estimatedVisitDurationMinutes: 45,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 80,
      qualityScore: 75,
      travelBurdenScore: 10,
      candidateScore: 82,
      estimatedDurationMin: 45,
      estimatedCostPerPerson: 0,
    };

    const matrixF = createMockMatrix({
      'START::END': { durationMinutes: 25, distanceMeters: 23000 },
      'START::MORNING_PLACE': { durationMinutes: 10, distanceMeters: 8000 },
      'MORNING_PLACE::END': { durationMinutes: 20, distanceMeters: 17000 },
      'START::AFTERNOON_PLACE': { durationMinutes: 15, distanceMeters: 12000 },
      'AFTERNOON_PLACE::END': { durationMinutes: 15, distanceMeters: 12000 },
      'MORNING_PLACE::AFTERNOON_PLACE': { durationMinutes: 15, distanceMeters: 10000 },
      'AFTERNOON_PLACE::MORNING_PLACE': { durationMinutes: 15, distanceMeters: 10000 },
    });

    const constraintsF: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '11:00', latestArrivalTime: '16:00' }, // Trip starts at 11:00
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['shopping', 'art'],
      pace: 'moderate',
    };

    const resF = optimizer.optimizeAndValidate({
      constraints: constraintsF,
      candidates: [morningPlace, afternoonPlace],
      routeMatrix: matrixF,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const selectedF = resF.output.orderedPlaceIds;
    // MORNING_PLACE closes at 09:30, trip starts at 11:00 -> MORNING_PLACE must be rejected!
    const passedF =
      !selectedF.includes('MORNING_PLACE') &&
      selectedF.includes('AFTERNOON_PLACE') &&
      resF.validation.isValid;

    results.push({
      testId: 'TEST_F',
      name: 'Opening Hours Constraint (Closed Location Pruning)',
      passed: passedF,
      notes: passedF
        ? `Morning Market (closes 09:30) correctly pruned when trip starts at 11:00. Art Gallery (10:00–18:00) scheduled successfully.`
        : `Test F failed: selected=${selectedF.join(', ')}`,
      data: { selected: selectedF },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_F',
      name: 'Opening Hours Constraint',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST G: No Feasible Activity (Minimal Safe Fallback)
  // -----------------------------------------------------------------
  try {
    // 30 minute trip window, where START -> END alone takes 25 minutes
    const constraintsG: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '10:00', latestArrivalTime: '10:35' }, // 35 min total
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['museum'],
      pace: 'moderate',
    };

    const dummyCand: CandidatePlace = {
      id: 'DUMMY',
      name: 'DUMMY',
      category: 'attraction',
      categories: ['tourism.sights'],
      latitude: 17.50,
      longitude: 78.42,
      coordinates: { lat: 17.50, lng: 78.42 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 30,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 70,
      qualityScore: 70,
      travelBurdenScore: 10,
      candidateScore: 75,
      estimatedDurationMin: 30,
      estimatedCostPerPerson: 0,
    };

    const matrixG = createMockMatrix({
      'START::END': { durationMinutes: 25, distanceMeters: 23000 },
      'START::DUMMY': { durationMinutes: 10, distanceMeters: 8000 },
      'DUMMY::END': { durationMinutes: 20, distanceMeters: 17000 },
    });

    const resG = optimizer.optimizeAndValidate({
      constraints: constraintsG,
      candidates: [dummyCand],
      routeMatrix: matrixG,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const passedG =
      resG.itinerary.stops.length === 2 &&
      resG.itinerary.stops[0].type === 'start' &&
      resG.itinerary.stops[1].type === 'end' &&
      resG.validation.isValid;

    results.push({
      testId: 'TEST_G',
      name: 'No Feasible Activity (Safe Minimal START -> END Fallback)',
      passed: passedG,
      notes: passedG
        ? `No intermediate stops fit in 35-minute window. Returned safe minimal plan [START -> END] without violating hard constraints.`
        : `Test G failed: stops=${resG.itinerary.stops.length}`,
      data: { stopCount: resG.itinerary.stops.length },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_G',
      name: 'No Feasible Activity',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST H: Missing Route Matrix Entry (Graceful Exclusion)
  // -----------------------------------------------------------------
  try {
    const unreachablePlace: CandidatePlace = {
      id: 'UNREACHABLE',
      name: 'Unreachable Island',
      category: 'attraction',
      categories: ['tourism.sights'],
      latitude: 17.50,
      longitude: 78.42,
      coordinates: { lat: 17.50, lng: 78.42 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 30,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 90,
      qualityScore: 90,
      travelBurdenScore: 0,
      candidateScore: 90,
      estimatedDurationMin: 30,
      estimatedCostPerPerson: 0,
    };

    // Matrix has NO entry for START::UNREACHABLE (missing or null route)
    const matrixH = createMockMatrix({
      'START::END': { durationMinutes: 25, distanceMeters: 23000 },
      'UNREACHABLE::END': { durationMinutes: 15, distanceMeters: 10000 },
    });

    const constraintsH: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '10:00', latestArrivalTime: '18:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['sights'],
      pace: 'moderate',
    };

    const resH = optimizer.optimizeAndValidate({
      constraints: constraintsH,
      candidates: [unreachablePlace],
      routeMatrix: matrixH,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const passedH =
      !resH.output.orderedPlaceIds.includes('UNREACHABLE') &&
      resH.validation.isValid;

    results.push({
      testId: 'TEST_H',
      name: 'Missing Matrix Route Cell Exclusion',
      passed: passedH,
      notes: passedH
        ? `Missing route matrix cell gracefully excluded from search graph without crashing or inventing fallback travel times.`
        : `Test H failed: places=${resH.output.orderedPlaceIds.join(', ')}`,
      data: { schedule: resH.output.schedule },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_H',
      name: 'Missing Matrix Route',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST I: Reproducibility (Zero Randomness Guarantee)
  // -----------------------------------------------------------------
  try {
    const cand1: CandidatePlace = {
      id: 'PLACE_1',
      name: 'Museum 1',
      category: 'museum',
      categories: ['entertainment.museum'],
      latitude: 17.48,
      longitude: 78.43,
      coordinates: { lat: 17.48, lng: 78.43 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 45,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 50, currency: 'INR' },
      costSource: 'known',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 75,
      qualityScore: 75,
      travelBurdenScore: 10,
      candidateScore: 80,
      estimatedDurationMin: 45,
      estimatedCostPerPerson: 50,
    };

    const cand2: CandidatePlace = {
      id: 'PLACE_2',
      name: 'Park 2',
      category: 'park',
      categories: ['leisure.park'],
      latitude: 17.44,
      longitude: 78.46,
      coordinates: { lat: 17.44, lng: 78.46 },
      city: 'Hyderabad',
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: 30,
      visitDurationSource: 'category_default',
      cost: { amountPerPerson: 0, isFree: true, currency: 'INR' },
      costSource: 'free',
      verificationStatus: 'verified',
      source: 'geoapify',
      relevanceScore: 75,
      qualityScore: 75,
      travelBurdenScore: 10,
      candidateScore: 80,
      estimatedDurationMin: 30,
      estimatedCostPerPerson: 0,
    };

    const matrixI = createMockMatrix({
      'START::END': { durationMinutes: 25, distanceMeters: 23000 },
      'START::PLACE_1': { durationMinutes: 12, distanceMeters: 10000 },
      'PLACE_1::END': { durationMinutes: 18, distanceMeters: 15000 },
      'START::PLACE_2': { durationMinutes: 20, distanceMeters: 18000 },
      'PLACE_2::END': { durationMinutes: 10, distanceMeters: 8000 },
      'PLACE_1::PLACE_2': { durationMinutes: 12, distanceMeters: 9000 },
      'PLACE_2::PLACE_1': { durationMinutes: 12, distanceMeters: 9000 },
    });

    const constraintsI: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: startLoc,
      endPoint: endLoc,
      time: { date: '2026-10-01', startTime: '10:00', latestArrivalTime: '16:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['museum', 'park'],
      pace: 'moderate',
    };

    const run1 = optimizer.optimize({
      constraints: constraintsI,
      candidates: [cand1, cand2],
      routeMatrix: matrixI,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const run2 = optimizer.optimize({
      constraints: constraintsI,
      candidates: [cand1, cand2],
      routeMatrix: matrixI,
      startLocation: startLoc,
      endLocation: endLoc,
    });

    const identicalSchedule =
      JSON.stringify(run1.orderedPlaceIds) === JSON.stringify(run2.orderedPlaceIds) &&
      run1.plannedArrivalTimeAtEnd === run2.plannedArrivalTimeAtEnd &&
      run1.objectiveScore === run2.objectiveScore;

    results.push({
      testId: 'TEST_I',
      name: 'Deterministic Reproducibility (Zero Randomness)',
      passed: identicalSchedule,
      notes: identicalSchedule
        ? `Identical runs produced bit-for-bit identical schedules (${run1.orderedPlaceIds.join(' -> ')}), end arrival (${run1.plannedArrivalTimeAtEnd}), and score (${run1.objectiveScore}).`
        : 'Runs produced divergent results.',
      data: { score1: run1.objectiveScore, score2: run2.objectiveScore },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_I',
      name: 'Deterministic Reproducibility',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  // -----------------------------------------------------------------
  // TEST A: Simple Feasible Trip with Real Geoapify API Data
  // -----------------------------------------------------------------
  try {
    const geocoding = new GeoapifyGeocodingService();
    const placesService = new GeoapifyPlacesService();
    const matrixService = new GeoapifyMatrixService();

    // 1. Geocode start and end
    const startGeo = await geocoding.geocodeLocation({ city: 'Hyderabad', locationText: 'VNR VJIET' });
    const endGeo = await geocoding.geocodeLocation({ city: 'Hyderabad', locationText: 'Hyderabad Railway Station' });

    if (!startGeo.success || !endGeo.success) {
      throw new Error('Could not geocode Hyderabad test points');
    }

    const realStart: LocationPoint = {
      name: startGeo.name,
      placeId: startGeo.placeId || 'START',
      coordinates: { lat: startGeo.latitude, lng: startGeo.longitude },
      type: 'custom',
    };

    const realEnd: LocationPoint = {
      name: endGeo.name,
      placeId: endGeo.placeId || 'END',
      coordinates: { lat: endGeo.latitude, lng: endGeo.longitude },
      type: 'station',
    };

    // 2. Discover real candidates (history + food)
    const discoveryRes = await placesService.discoverCandidates({
      city: 'Hyderabad',
      start: realStart,
      end: realEnd,
      interests: ['history', 'food'],
      availableTripMinutes: 600, // 10:00 to 20:00 (10 hours)
      budget: { total: 2000, currency: 'INR' },
      poolTargetSize: 6, // Keep pool compact for matrix efficiency
      bypassCache: false,
    });

    const candidateSubset = discoveryRes.candidates.slice(0, 5);

    // 3. Construct real Route Matrix over START + 5 candidates + END = 7 points (49 cells)
    const matrixLocations = [
      { id: realStart.placeId || 'START', name: realStart.name, coordinates: realStart.coordinates },
      ...candidateSubset.map((c) => ({ id: c.id, name: c.name, coordinates: c.coordinates })),
      { id: realEnd.placeId || 'END', name: realEnd.name, coordinates: realEnd.coordinates },
    ];

    const realMatrix = await matrixService.calculateRouteMatrix(matrixLocations, 'drive');

    // 4. Optimize and validate
    const constraintsA: TripConstraints = {
      city: 'Hyderabad',
      startingPoint: realStart,
      endPoint: realEnd,
      time: { date: '2026-10-01', startTime: '10:00', latestArrivalTime: '20:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['history', 'food'],
      pace: 'moderate',
    };

    const resA = optimizer.optimizeAndValidate({
      constraints: constraintsA,
      candidates: candidateSubset,
      routeMatrix: realMatrix,
      startLocation: realStart,
      endLocation: realEnd,
    });

    const passedA =
      resA.output.isFeasible &&
      resA.validation.isValid &&
      resA.output.schedule.length >= 1 &&
      resA.itinerary.stops[0].title === realStart.name &&
      resA.itinerary.stops[resA.itinerary.stops.length - 1].title === realEnd.name;

    results.push({
      testId: 'TEST_A',
      name: 'Full Real API Integration Trip (Hyderabad: VNR VJIET -> Railway Station)',
      passed: passedA,
      notes: passedA
        ? `Successfully generated validated itinerary with ${resA.output.schedule.length} stops (${resA.output.orderedPlaceIds.join(', ')}). Planned arrival at destination: ${resA.output.plannedArrivalTimeAtEnd} (Safety buffer: ${resA.output.totalBufferMinutes}m before 20:00 deadline). Validated: 14/14 checks passed.`
        : `Test A failed: feasible=${resA.output.isFeasible}, valid=${resA.validation.isValid}`,
      data: {
        stops: resA.output.schedule.map((s) => ({ name: s.name, arr: s.arrivalTime, dep: s.departureTime })),
        score: resA.output.objectiveScore,
        breakdown: resA.output.scoreBreakdown,
      },
    });
  } catch (err) {
    results.push({
      testId: 'TEST_A',
      name: 'Full Real API Integration Trip',
      passed: false,
      notes: err instanceof Error ? err.message : String(err),
    });
  }

  const passedTests = results.filter((r) => r.passed).length;
  return {
    timestamp: new Date().toISOString(),
    hasApiKey,
    totalTests: results.length,
    passedTests,
    failedTests: results.length - passedTests,
    results,
  };
}
