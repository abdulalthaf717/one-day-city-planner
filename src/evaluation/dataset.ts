/**
 * Deterministic Evaluation Benchmark Dataset (20 Scenarios).
 *
 * NOTE: These are controlled deterministic evaluation fixtures designed to test
 * optimizer mathematics, constraint satisfaction, time-window logic, and failure handling
 * without relying on live external networks or consuming third-party API quotas.
 *
 * Clearly separated from live API integration tests in scripts/test-tools.mjs and test-agent.mjs.
 */

import {
  CandidatePlace,
  DirectionalRouteMatrix,
  RouteMatrixElement,
  TravelMode,
} from '@/domain';
import { EvaluationScenario } from './types';

// =============================================================================
// CONTROLLED FIXTURE LOCATIONS
// =============================================================================

export const FIXTURE_LOCATIONS = {
  vnr: {
    name: 'VNR VJIET, Bachupally',
    coordinates: { lat: 17.5389, lng: 78.3862 },
    type: 'custom' as const,
    placeId: 'loc_vnr',
  },
  station: {
    name: 'Secunderabad Railway Station',
    coordinates: { lat: 17.4344, lng: 78.5013 },
    type: 'station' as const,
    placeId: 'loc_station',
  },
  airport: {
    name: 'RGIA Rajiv Gandhi International Airport',
    coordinates: { lat: 17.2403, lng: 78.4294 },
    type: 'airport' as const,
    placeId: 'loc_airport',
  },
};

// =============================================================================
// CONTROLLED FIXTURE CANDIDATE PLACES
// =============================================================================

export const FIXTURE_CANDIDATES: Record<string, CandidatePlace> = {
  golconda: {
    id: 'cand_golconda',
    name: 'Golconda Fort',
    category: 'historic',
    categories: ['tourism.sights.castle', 'heritage'],
    latitude: 17.3833,
    longitude: 78.4011,
    coordinates: { lat: 17.3833, lng: 78.4011 },
    address: 'Ibrahim Bagh, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '09:00-17:30',
    estimatedVisitDurationMinutes: 90,
    estimatedDurationMin: 90,
    visitDurationSource: 'provider',
    cost: { amountPerPerson: 150, currency: '₹', isFree: false },
    estimatedCostPerPerson: 150,
    costSource: 'known',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 95,
    qualityScore: 92,
    travelBurdenScore: 25,
    candidateScore: 92,
  },
  charminar: {
    id: 'cand_charminar',
    name: 'Charminar',
    category: 'attraction',
    categories: ['tourism.sights', 'monument'],
    latitude: 17.3616,
    longitude: 78.4747,
    coordinates: { lat: 17.3616, lng: 78.4747 },
    address: 'Charminar Rd, Old City, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '09:30-17:30',
    estimatedVisitDurationMinutes: 60,
    estimatedDurationMin: 60,
    visitDurationSource: 'category_default',
    cost: { amountPerPerson: 50, currency: '₹', isFree: false },
    estimatedCostPerPerson: 50,
    costSource: 'known',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 98,
    qualityScore: 95,
    travelBurdenScore: 30,
    candidateScore: 95,
  },
  salarjung: {
    id: 'cand_salarjung',
    name: 'Salar Jung Museum',
    category: 'museum',
    categories: ['entertainment.museum'],
    latitude: 17.3713,
    longitude: 78.4803,
    coordinates: { lat: 17.3713, lng: 78.4803 },
    address: 'Darulshifa, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '10:00-17:00',
    estimatedVisitDurationMinutes: 105,
    estimatedDurationMin: 105,
    visitDurationSource: 'provider',
    cost: { amountPerPerson: 100, currency: '₹', isFree: false },
    estimatedCostPerPerson: 100,
    costSource: 'known',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 90,
    qualityScore: 90,
    travelBurdenScore: 30,
    candidateScore: 88,
  },
  biryani: {
    id: 'cand_biryani',
    name: 'Paradise Heritage Dining',
    category: 'restaurant',
    categories: ['catering.restaurant'],
    latitude: 17.4418,
    longitude: 78.4871,
    coordinates: { lat: 17.4418, lng: 78.4871 },
    address: 'MG Road, Secunderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '11:30-23:00',
    estimatedVisitDurationMinutes: 60,
    estimatedDurationMin: 60,
    visitDurationSource: 'category_default',
    cost: { amountPerPerson: 450, currency: '₹', isFree: false },
    estimatedCostPerPerson: 450,
    costSource: 'estimated',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 85,
    qualityScore: 88,
    travelBurdenScore: 15,
    candidateScore: 86,
  },
  lumbini: {
    id: 'cand_lumbini',
    name: 'Lumbini Public Park',
    category: 'park',
    categories: ['leisure.park'],
    latitude: 17.4101,
    longitude: 78.4729,
    coordinates: { lat: 17.4101, lng: 78.4729 },
    address: 'Khairatabad, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '09:00-21:00',
    estimatedVisitDurationMinutes: 45,
    estimatedDurationMin: 45,
    visitDurationSource: 'category_default',
    cost: { amountPerPerson: 0, currency: '₹', isFree: true },
    estimatedCostPerPerson: 0,
    costSource: 'free',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 80,
    qualityScore: 82,
    travelBurdenScore: 20,
    candidateScore: 82,
  },
  tankbund: {
    id: 'cand_tankbund',
    name: 'Hussain Sagar Lake Promenade',
    category: 'park',
    categories: ['tourism.sights.viewpoint', 'leisure.park'],
    latitude: 17.4239,
    longitude: 78.4738,
    coordinates: { lat: 17.4239, lng: 78.4738 },
    address: 'Tank Bund Rd, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '00:00-23:59',
    estimatedVisitDurationMinutes: 30,
    estimatedDurationMin: 30,
    visitDurationSource: 'category_default',
    cost: { amountPerPerson: 0, currency: '₹', isFree: true },
    estimatedCostPerPerson: 0,
    costSource: 'free',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 82,
    qualityScore: 80,
    travelBurdenScore: 18,
    candidateScore: 83,
  },
  shilparamam: {
    id: 'cand_shilparamam',
    name: 'Shilparamam Arts Village',
    category: 'shopping',
    categories: ['commercial.marketplace', 'tourism.sights'],
    latitude: 17.4526,
    longitude: 78.3789,
    coordinates: { lat: 17.4526, lng: 78.3789 },
    address: 'Hitech City, Madhapur, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '10:30-20:30',
    estimatedVisitDurationMinutes: 75,
    estimatedDurationMin: 75,
    visitDurationSource: 'category_default',
    cost: { amountPerPerson: 80, currency: '₹', isFree: false },
    estimatedCostPerPerson: 80,
    costSource: 'known',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 85,
    qualityScore: 84,
    travelBurdenScore: 10,
    candidateScore: 85,
  },
  chowmahalla: {
    id: 'cand_chowmahalla',
    name: 'Chowmahalla Palace',
    category: 'historic',
    categories: ['tourism.sights.castle', 'heritage'],
    latitude: 17.3578,
    longitude: 78.4717,
    coordinates: { lat: 17.3578, lng: 78.4717 },
    address: 'Motigalli, Khilwat, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    openingHours: '10:00-17:00',
    estimatedVisitDurationMinutes: 75,
    estimatedDurationMin: 75,
    visitDurationSource: 'category_default',
    cost: { amountPerPerson: 100, currency: '₹', isFree: false },
    estimatedCostPerPerson: 100,
    costSource: 'known',
    verificationStatus: 'verified',
    source: 'verified_catalog',
    relevanceScore: 92,
    qualityScore: 91,
    travelBurdenScore: 32,
    candidateScore: 90,
  },
  photo_charminar: {
    id: 'cand_photo_charminar',
    name: 'Charminar (Photo Discovered)',
    category: 'attraction',
    categories: ['tourism.sights'],
    latitude: 17.3616,
    longitude: 78.4747,
    coordinates: { lat: 17.3616, lng: 78.4747 },
    address: 'Charminar Rd, Hyderabad',
    city: 'Hyderabad',
    openingHoursSource: 'provider',
    estimatedVisitDurationMinutes: 60,
    estimatedDurationMin: 60,
    visitDurationSource: 'category_default',
    cost: { amountPerPerson: 50, currency: '₹', isFree: false },
    estimatedCostPerPerson: 50,
    costSource: 'known',
    verificationStatus: 'verified',
    source: 'user_upload',
    addedViaImage: true,
    relevanceScore: 98,
    qualityScore: 95,
    travelBurdenScore: 28,
    candidateScore: 98,
  },
};

// =============================================================================
// CONTROLLED DIRECTIONAL ROUTE MATRIX (Asymmetrical Road Travel Times)
// =============================================================================

export function createFixtureMatrix(allIds: string[], travelMode: TravelMode = 'drive'): DirectionalRouteMatrix {
  const matrix: Record<string, RouteMatrixElement> = {};
  const nestedMatrix: Record<string, Record<string, RouteMatrixElement>> = {};
  const speedFactor = travelMode === 'walk' ? 6.5 : travelMode === 'bicycle' ? 2.5 : 1.0;

  for (const fromId of allIds) {
    nestedMatrix[fromId] = {};
    for (const toId of allIds) {
      if (fromId === toId) {
        const el: RouteMatrixElement = {
          fromId,
          toId,
          distanceMeters: 0,
          durationSeconds: 0,
          durationMinutes: 0,
          status: 'OK',
          mode: travelMode,
          trafficModel: travelMode === 'drive' ? 'approximated' : 'not_applicable',
          source: 'geoapify',
        };
        matrix[`${fromId}::${toId}`] = el;
        nestedMatrix[fromId][toId] = el;
      } else {
        const i = allIds.indexOf(fromId);
        const j = allIds.indexOf(toId);
        const distKm = Math.abs(i - j) * 3.8 + 2.5;
        const distMeters = Math.round(distKm * 1000);
        const asymmetry = j > i ? 2 : 0;
        const durationMin = Math.max(5, Math.round((distKm * 1.6 + asymmetry) * speedFactor));

        const el: RouteMatrixElement = {
          fromId,
          toId,
          distanceMeters: distMeters,
          durationSeconds: durationMin * 60,
          durationMinutes: durationMin,
          status: 'OK',
          mode: travelMode,
          trafficModel: travelMode === 'drive' ? 'approximated' : 'not_applicable',
          source: 'geoapify',
        };
        matrix[`${fromId}::${toId}`] = el;
        nestedMatrix[fromId][toId] = el;
      }
    }
  }

  return {
    mode: travelMode,
    trafficModel: travelMode === 'drive' ? 'approximated' : 'not_applicable',
    locationIds: allIds,
    cellCount: allIds.length * allIds.length,
    matrix,
    nestedMatrix,
    calculatedAt: '2026-09-28T12:00:00.000Z',
  };
}

// Default standard candidates pool
const STANDARD_POOL = [
  FIXTURE_CANDIDATES.golconda,
  FIXTURE_CANDIDATES.charminar,
  FIXTURE_CANDIDATES.salarjung,
  FIXTURE_CANDIDATES.biryani,
  FIXTURE_CANDIDATES.lumbini,
  FIXTURE_CANDIDATES.tankbund,
];

const ALL_IDS = ['loc_vnr', ...STANDARD_POOL.map((c) => c.id), 'loc_station', 'loc_airport'];
const DRIVE_MATRIX = createFixtureMatrix(ALL_IDS, 'drive');
const WALK_MATRIX = createFixtureMatrix(ALL_IDS, 'walk');

// =============================================================================
// 20 EVALUATION BENCHMARK SCENARIOS
// =============================================================================

export const EVALUATION_SCENARIOS: EvaluationScenario[] = [
  // 1. Normal full-day trip
  {
    id: 'SCENARIO_01_NORMAL_FULL_DAY',
    name: 'Normal Full-Day Tour (Hyderabad Drive)',
    category: 'standard',
    description: 'Standard 9:30 AM to 7:00 PM full day trip, drive mode, moderate budget, mixed history and food interests.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '19:00' },
      budget: { total: 2500, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History', 'Food'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      maxPlannedCost: 2500,
      mustArriveBeforeLatest: true,
      minVisitedStops: 2,
    },
  },

  // 2. Short trip / Tight time window (Pruning distant stops)
  {
    id: 'SCENARIO_02_TIGHT_TIME_WINDOW',
    name: 'Short Trip (2-Hour Window Pruning)',
    category: 'time_stress',
    description: 'Very short 2-hour window (10:00 to 12:00) requiring the optimizer to prune long-duration stops.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '10:00', latestArrivalTime: '12:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['Nature'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.tankbund, FIXTURE_CANDIDATES.salarjung],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
      maxVisitedStops: 1,
    },
  },

  // 3. Low budget trip (Free sights priority)
  {
    id: 'SCENARIO_03_LOW_BUDGET_FREE_PARKS',
    name: 'Low Budget (₹300) - Selects Free Parks',
    category: 'budget_stress',
    description: 'Strict ₹300 budget for 2 people forcing optimizer to reject ₹900 dining and pick free public parks.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '18:00' },
      budget: { total: 300, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['Nature'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.biryani, FIXTURE_CANDIDATES.lumbini, FIXTURE_CANDIDATES.tankbund],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      maxPlannedCost: 300,
      mustArriveBeforeLatest: true,
    },
  },

  // 4. High budget trip
  {
    id: 'SCENARIO_04_HIGH_BUDGET_FULL_EXPERIENCE',
    name: 'High Budget (₹5,000) - Premium Access',
    category: 'budget_stress',
    description: 'Generous ₹5,000 budget accommodating dining, castles, and all museum admissions.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '20:00' },
      budget: { total: 5000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History', 'Food', 'Museum'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      maxPlannedCost: 5000,
      mustArriveBeforeLatest: true,
      minVisitedStops: 3,
    },
  },

  // 5. No interests provided (Balanced diversity)
  {
    id: 'SCENARIO_05_EMPTY_INTERESTS_BALANCED',
    name: 'Empty Interests (General Tour)',
    category: 'preference',
    description: 'Empty interests array tests diversity bonus across sights, museums, dining, and parks.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '18:30' },
      budget: { total: 2500, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: [],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
      minVisitedStops: 2,
    },
  },

  // 6. Food-only interest
  {
    id: 'SCENARIO_06_FOOD_FOCUS',
    name: 'Food-Only Priority Tour',
    category: 'preference',
    description: 'Prioritizes dining and culinary stops.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '11:00', latestArrivalTime: '16:00' },
      budget: { total: 1500, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['Food'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.biryani, FIXTURE_CANDIDATES.lumbini],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 7. History-only interest
  {
    id: 'SCENARIO_07_HISTORY_HERITAGE_FOCUS',
    name: 'History & Heritage Focus',
    category: 'preference',
    description: 'Prioritizes historical monuments (Golconda, Charminar).',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '18:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.golconda, FIXTURE_CANDIDATES.charminar, FIXTURE_CANDIDATES.lumbini],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 8. Multiple diverse interests
  {
    id: 'SCENARIO_08_MULTI_INTEREST_DIVERSITY',
    name: 'Multi-Interest Diversity (History + Food + Nature)',
    category: 'preference',
    description: 'Tests multi-interest balance under moderate pace.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '19:30' },
      budget: { total: 3000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History', 'Food', 'Nature'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
      minVisitedStops: 3,
    },
  },

  // 9. Walking travel mode
  {
    id: 'SCENARIO_09_WALKING_MODE',
    name: 'Walking Travel Mode (Strict Travel Speeds)',
    category: 'travel_mode',
    description: 'Walking travel mode enforces ~4.5 km/h speeds and rejects distant attractions.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '19:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'walk',
      numberOfPeople: 1,
      interests: ['Nature'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.lumbini, FIXTURE_CANDIDATES.tankbund],
      routeMatrix: WALK_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 10. Driving travel mode
  {
    id: 'SCENARIO_10_DRIVING_MODE',
    name: 'Driving Travel Mode (Road Network Matrix)',
    category: 'travel_mode',
    description: 'Standard drive travel mode using directional road network.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '19:00' },
      budget: { total: 2500, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 11. Transit travel mode
  {
    id: 'SCENARIO_11_TRANSIT_MODE',
    name: 'Public Transit Mode Estimation',
    category: 'travel_mode',
    description: 'Transit travel mode incorporating schedule approximations.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '19:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'transit',
      numberOfPeople: 2,
      interests: ['History', 'Nature'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 12. Airport destination end point (Long corridor)
  {
    id: 'SCENARIO_12_AIRPORT_END_POINT',
    name: 'Airport Destination Corridor (RGIA Airport)',
    category: 'corridor',
    description: 'Long travel corridor ending at Shamshabad Airport, requiring high buffer.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.airport,
      time: { date: '2026-09-28', startTime: '10:00', latestArrivalTime: '18:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.airport,
      candidates: [FIXTURE_CANDIDATES.golconda, FIXTURE_CANDIDATES.charminar],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 13. Railway station destination
  {
    id: 'SCENARIO_13_RAILWAY_STATION_END_POINT',
    name: 'Railway Station Destination End Point',
    category: 'corridor',
    description: 'Central hub termination at Secunderabad Railway Station.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '18:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['Nature', 'Shopping'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.lumbini, FIXTURE_CANDIDATES.shilparamam, FIXTURE_CANDIDATES.tankbund],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 14. Party size change dynamic replan (Group cost multiplication)
  {
    id: 'SCENARIO_14_PARTY_SIZE_REPLAN',
    name: 'Party Size Increase (2 pax → 6 pax)',
    category: 'replanning',
    description: 'Tests group budget multiplication (6 people × ticket prices) under ₹2,000 budget.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '18:30' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 6,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      maxPlannedCost: 2000,
      mustArriveBeforeLatest: true,
    },
  },

  // 15. Budget slash dynamic replan (Prunes expensive spots)
  {
    id: 'SCENARIO_15_BUDGET_SLASH_REPLAN',
    name: 'Budget Slash Replan (₹2500 → ₹800)',
    category: 'replanning',
    description: 'Simulates user reducing budget by 68% after initial plan.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '19:00' },
      budget: { total: 800, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History', 'Food'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      maxPlannedCost: 800,
      mustArriveBeforeLatest: true,
    },
  },

  // 16. Travel mode switch dynamic replan (Drive -> Walk)
  {
    id: 'SCENARIO_16_TRAVEL_MODE_SWITCH_REPLAN',
    name: 'Travel Mode Switch (Drive → Walk)',
    category: 'replanning',
    description: 'Tests surgical route invalidation and walking schedule feasibility.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:00', latestArrivalTime: '19:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'walk',
      numberOfPeople: 1,
      interests: ['Nature'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.lumbini, FIXTURE_CANDIDATES.tankbund],
      routeMatrix: WALK_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
    },
  },

  // 17. Time window reduction replan (19:00 -> 14:00)
  {
    id: 'SCENARIO_17_TIME_WINDOW_REDUCTION_REPLAN',
    name: 'Time Window Reduction (19:00 → 14:00)',
    category: 'replanning',
    description: 'Simulates earlier departure flight, pruning lower utility afternoon stops.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '14:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
      maxVisitedStops: 2,
    },
  },

  // 18. Impossible itinerary (Direct START -> END fallback)
  {
    id: 'SCENARIO_18_IMPOSSIBLE_DEADLINE',
    name: 'Impossible Deadline (15-Minute Window Fallback)',
    category: 'edge_case',
    description: '15-minute window cannot fit any 60m+ activities. Optimizer returns safe 0-stop START -> END.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '09:45' },
      budget: { total: 1000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 1,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: STANDARD_POOL,
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      maxVisitedStops: 0,
      mustArriveBeforeLatest: false,
    },
  },

  // 19. Image-added landmark integration
  {
    id: 'SCENARIO_19_IMAGE_ADDED_LANDMARK',
    name: 'Multimodal Photo-Added Destination (Charminar)',
    category: 'multimodal',
    description: 'Tests mandatory incorporation of user photo landmark (Charminar) into schedule.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '19:00' },
      budget: { total: 2500, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [FIXTURE_CANDIDATES.photo_charminar, FIXTURE_CANDIDATES.golconda, FIXTURE_CANDIDATES.lumbini],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      mustArriveBeforeLatest: true,
      requiredStopIds: ['cand_photo_charminar'],
    },
  },

  // 20. Fictional / Unverified place rejection
  {
    id: 'SCENARIO_20_UNVERIFIED_FICTIONAL_PLACE',
    name: 'Unverified Fictional Place (Zero Fabrication Rejection)',
    category: 'edge_case',
    description: 'Fictional monument with unavailable coordinates is rejected from itinerary.',
    constraints: {
      city: 'Hyderabad',
      startingPoint: FIXTURE_LOCATIONS.vnr,
      endPoint: FIXTURE_LOCATIONS.station,
      time: { date: '2026-09-28', startTime: '09:30', latestArrivalTime: '19:00' },
      budget: { total: 2000, currency: '₹' },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History'],
      pace: 'moderate',
    },
    fixtures: {
      startLocation: FIXTURE_LOCATIONS.vnr,
      endLocation: FIXTURE_LOCATIONS.station,
      candidates: [
        FIXTURE_CANDIDATES.lumbini,
        {
          ...FIXTURE_CANDIDATES.charminar,
          id: 'fake_place_xyz',
          name: 'NonExistentFictionalMonumentXYZ',
          verificationStatus: 'unverified',
          candidateScore: 0,
        },
      ],
      routeMatrix: DRIVE_MATRIX,
    },
    expectedOutcomes: {
      expectFeasible: true,
      forbiddenStopIds: ['fake_place_xyz'],
      mustArriveBeforeLatest: true,
    },
  },
];
