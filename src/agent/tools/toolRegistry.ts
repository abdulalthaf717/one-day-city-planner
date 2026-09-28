/**
 * Approved Agent Tool Registry with Strict Argument Validation.
 *
 * Core Principles:
 * - Approved Tool Registry ONLY: The agent can only invoke tools in this registry.
 * - Runtime Argument Validation: Rejects malformed arguments, invalid travel modes (e.g. "flying_car"),
 *   impossible coordinates, and excessive matrix cell counts BEFORE reaching provider APIs.
 * - Zero Fabrication: Geocodes and places are strictly real API data.
 * - Pure Computation: Routing and optimization rely on deterministic services.
 */

import {
  CandidatePlace,
  Coordinates,
  DirectionalRouteMatrix,
  FinalItinerary,
  LocationPoint,
  OptimizerOutput,
  TravelMode,
  TripConstraints,
  ValidationResult,
} from '@/domain';
import { DeterministicOptimizer } from '@/optimizer';
import {
  GeoapifyGeocodingService,
  GeoapifyMatrixService,
  GeoapifyPlacesService,
  IGeoapifyMatrixService,
  IGeoapifyPlacesService,
} from '@/services/geoapify';
import { DeterministicValidator } from '@/validator';

export interface ResolveLocationsArgs {
  city: string;
  start: string;
  end: string;
}

export interface ResolveLocationsResult {
  startLocation: LocationPoint;
  endLocation: LocationPoint;
  success: boolean;
  warnings: string[];
}

export interface DiscoverCandidatesArgs {
  tripConstraints: TripConstraints;
  poolTargetSize?: number;
}

export interface DiscoverCandidatesResult {
  candidates: CandidatePlace[];
  metadata: {
    rawFound: number;
    deduplicated: number;
    corridorSpanKm: number;
    fromCache: boolean;
  };
}

export interface CalculateRouteMatrixArgs {
  locations: Array<{ id: string; name: string; coordinates: Coordinates }>;
  travelMode: TravelMode;
}

export interface CalculateRouteMatrixResult {
  routeMatrix: DirectionalRouteMatrix;
  metadata: {
    locationCount: number;
    cellCount: number;
    mode: TravelMode;
  };
}

export interface OptimizeItineraryArgs {
  tripConstraints: TripConstraints;
  candidates: CandidatePlace[];
  routeMatrix: DirectionalRouteMatrix;
  startLocation?: LocationPoint;
  endLocation?: LocationPoint;
  pinnedPlaceIds?: string[];
}

export interface OptimizeItineraryResult {
  itinerary: FinalItinerary;
  output: OptimizerOutput;
  optimizerDiagnostics?: OptimizerOutput['diagnostics'];
}

export interface ValidateItineraryArgs {
  tripConstraints: TripConstraints;
  itinerary: FinalItinerary;
  routeMatrix?: DirectionalRouteMatrix;
}

export interface ValidateItineraryResult {
  validationResult: ValidationResult;
}

export class AgentToolRegistry {
  public geocodingService: GeoapifyGeocodingService;
  public placesService: IGeoapifyPlacesService;
  public matrixService: IGeoapifyMatrixService;
  public optimizer: DeterministicOptimizer;
  public validator: DeterministicValidator;

  constructor(
    geocodingService?: GeoapifyGeocodingService,
    placesService?: IGeoapifyPlacesService,
    matrixService?: IGeoapifyMatrixService,
    optimizer?: DeterministicOptimizer,
    validator?: DeterministicValidator
  ) {
    this.geocodingService = geocodingService || new GeoapifyGeocodingService();
    this.placesService = placesService || new GeoapifyPlacesService();
    this.matrixService = matrixService || new GeoapifyMatrixService();
    this.optimizer = optimizer || new DeterministicOptimizer();
    this.validator = validator || new DeterministicValidator();
  }

  /**
   * Tool 1: resolve_locations
   * Geocodes start and end points via Geoapify Geocoding API.
   */
  async resolveLocations(args: ResolveLocationsArgs): Promise<ResolveLocationsResult> {
    if (!args.city || typeof args.city !== 'string' || args.city.trim() === '') {
      throw new Error('TOOL_ARGUMENT_ERROR: "city" is required and must be a non-empty string.');
    }
    if (!args.start || typeof args.start !== 'string' || args.start.trim() === '') {
      throw new Error('TOOL_ARGUMENT_ERROR: "start" location is required and must be a non-empty string.');
    }
    if (!args.end || typeof args.end !== 'string' || args.end.trim() === '') {
      throw new Error('TOOL_ARGUMENT_ERROR: "end" location is required and must be a non-empty string.');
    }

    const [startRes, endRes] = await Promise.all([
      this.geocodingService.geocodeLocation({ city: args.city.trim(), locationText: args.start.trim() }),
      this.geocodingService.geocodeLocation({ city: args.city.trim(), locationText: args.end.trim() }),
    ]);

    const warnings: string[] = [];

    if (!startRes.success || startRes.latitude === 0) {
      throw new Error(`GEOCODING_FAILED: Could not resolve starting location "${args.start}" in "${args.city}".`);
    }
    if (!endRes.success || endRes.latitude === 0) {
      throw new Error(`GEOCODING_FAILED: Could not resolve destination/end location "${args.end}" in "${args.city}".`);
    }

    const startLocation: LocationPoint = {
      name: startRes.name,
      placeId: startRes.placeId || 'START',
      coordinates: { lat: startRes.latitude, lng: startRes.longitude },
      type: 'custom',
    };

    const endLocation: LocationPoint = {
      name: endRes.name,
      placeId: endRes.placeId || 'END',
      coordinates: { lat: endRes.latitude, lng: endRes.longitude },
      type: 'station',
    };

    return {
      startLocation,
      endLocation,
      success: true,
      warnings,
    };
  }

  /**
   * Tool 2: discover_candidates
   * Discovers and ranks candidate places along the start->end corridor via Geoapify Places v2 API.
   */
  async discoverCandidates(args: DiscoverCandidatesArgs): Promise<DiscoverCandidatesResult> {
    const { tripConstraints } = args;
    if (!tripConstraints) {
      throw new Error('TOOL_ARGUMENT_ERROR: "tripConstraints" is required for candidate discovery.');
    }

    const start = tripConstraints.startingPoint;
    const end = tripConstraints.endPoint;

    if (!start || !start.coordinates || typeof start.coordinates.lat !== 'number' || typeof start.coordinates.lng !== 'number') {
      throw new Error('TOOL_ARGUMENT_ERROR: startingPoint with valid coordinates is required.');
    }
    if (!end || !end.coordinates || typeof end.coordinates.lat !== 'number' || typeof end.coordinates.lng !== 'number') {
      throw new Error('TOOL_ARGUMENT_ERROR: endPoint with valid coordinates is required.');
    }

    const availableTripMinutes = Math.max(
      60,
      (new Date(`1970-01-01T${tripConstraints.time.latestArrivalTime}:00Z`).getTime() -
        new Date(`1970-01-01T${tripConstraints.time.startTime}:00Z`).getTime()) /
        60000
    );

    const discoveryRes = await this.placesService.discoverCandidates({
      city: tripConstraints.city,
      start,
      end,
      interests: tripConstraints.interests || [],
      availableTripMinutes,
      budget: { total: tripConstraints.budget.total, currency: tripConstraints.budget.currency },
      travelMode: tripConstraints.travelMode,
      poolTargetSize: args.poolTargetSize || 12,
      bypassCache: false,
    });

    return {
      candidates: discoveryRes.candidates,
      metadata: {
        rawFound: discoveryRes.metadata.rawCandidateCount,
        deduplicated: discoveryRes.metadata.deduplicatedCount,
        corridorSpanKm: discoveryRes.metadata.corridor.spanKm,
        fromCache: discoveryRes.metadata.fromCache,
      },
    };
  }

  /**
   * Tool 3: calculate_route_matrix
   * Computes directional road network travel times and distances using Geoapify Route Matrix API.
   */
  async calculateRouteMatrix(args: CalculateRouteMatrixArgs): Promise<CalculateRouteMatrixResult> {
    const { locations, travelMode } = args;

    // Strict enum validation
    const validModes: TravelMode[] = ['drive', 'transit', 'walk', 'bicycle'];
    if (!validModes.includes(travelMode)) {
      throw new Error(
        `TOOL_ARGUMENT_ERROR: Invalid travel mode "${travelMode}". Supported modes: ${validModes.join(', ')}.`
      );
    }

    if (!Array.isArray(locations) || locations.length < 2) {
      throw new Error('TOOL_ARGUMENT_ERROR: "locations" must be an array of at least 2 location points.');
    }

    // Matrix cell guard
    const cellCount = locations.length * locations.length;
    if (cellCount > 1000) {
      throw new Error(
        `MATRIX_SIZE_EXCEEDED: Requested matrix size of ${cellCount} cells (${locations.length} locations) exceeds safe free-tier limit of 1000 cells.`
      );
    }

    // Coordinate range checks
    for (const loc of locations) {
      if (!loc.coordinates || typeof loc.coordinates.lat !== 'number' || typeof loc.coordinates.lng !== 'number') {
        throw new Error(`TOOL_ARGUMENT_ERROR: Location "${loc.name || loc.id}" has invalid coordinates.`);
      }
      if (loc.coordinates.lat < -90 || loc.coordinates.lat > 90 || loc.coordinates.lng < -180 || loc.coordinates.lng > 180) {
        throw new Error(
          `TOOL_ARGUMENT_ERROR: Coordinates [${loc.coordinates.lat}, ${loc.coordinates.lng}] for "${loc.name}" are out of geographic bounds.`
        );
      }
    }

    const routeMatrix = await this.matrixService.calculateRouteMatrix(locations, travelMode);

    return {
      routeMatrix,
      metadata: {
        locationCount: locations.length,
        cellCount,
        mode: travelMode,
      },
    };
  }

  /**
   * Tool 4: optimize_itinerary
   * Runs the bounded beam search deterministic optimizer.
   */
  async optimizeItinerary(args: OptimizeItineraryArgs): Promise<OptimizeItineraryResult> {
    const { tripConstraints, candidates, routeMatrix, startLocation, endLocation, pinnedPlaceIds } = args;

    if (!tripConstraints) {
      throw new Error('TOOL_ARGUMENT_ERROR: "tripConstraints" is required for optimization.');
    }
    if (!Array.isArray(candidates)) {
      throw new Error('TOOL_ARGUMENT_ERROR: "candidates" must be an array.');
    }
    if (!routeMatrix || !routeMatrix.matrix) {
      throw new Error('TOOL_ARGUMENT_ERROR: Valid "routeMatrix" is required for optimization.');
    }

    const optResult = this.optimizer.optimizeAndValidate({
      constraints: tripConstraints,
      candidates,
      routeMatrix,
      startLocation: startLocation || tripConstraints.startingPoint,
      endLocation: endLocation || tripConstraints.endPoint,
      pinnedPlaceIds,
    });

    return {
      itinerary: optResult.itinerary,
      output: optResult.output,
      optimizerDiagnostics: optResult.output.diagnostics,
    };
  }

  /**
   * Tool 5: validate_itinerary
   * Evaluates the 14 hard constraint checks independently.
   */
  async validateItinerary(args: ValidateItineraryArgs): Promise<ValidateItineraryResult> {
    const { tripConstraints, itinerary } = args;

    if (!tripConstraints) {
      throw new Error('TOOL_ARGUMENT_ERROR: "tripConstraints" is required for validation.');
    }
    if (!itinerary || !Array.isArray(itinerary.stops) || itinerary.stops.length < 2) {
      throw new Error('TOOL_ARGUMENT_ERROR: "itinerary" must have at least 2 stops (START and END).');
    }

    const validationResult = this.validator.validate(itinerary, tripConstraints);

    return {
      validationResult,
    };
  }

  /**
   * Tool 6: analyze_uploaded_image (Stub for future multimodal milestone)
   */
  async analyzeUploadedImage(args: { imageBase64: string; mimeType: string; cityContext?: string }) {
    if (!args.imageBase64) {
      throw new Error('TOOL_ARGUMENT_ERROR: "imageBase64" is required.');
    }
    return {
      status: 'pending_user_decision',
      notice: 'Multimodal image identification is prepared for Milestone 6.',
    };
  }
}
