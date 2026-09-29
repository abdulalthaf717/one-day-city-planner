/**
 * Domain types for deterministic itinerary optimization.
 */

import { LocationPoint, TripConstraints } from './constraints';
import { OptimizerScoreBreakdown } from './itinerary';
import { CandidatePlace } from './places';
import { DirectionalRouteMatrix } from './routing';

export interface BufferPolicyConfig {
  minBufferMinutes: number;
  travelPercentBuffer: number;
  maxBufferMinutes: number;
  modeMultipliers?: Record<string, number>;
}

export interface OptimizationObjectives {
  /** 0 to 1 weight on minimizing total transit travel time */
  minimizeTravelTimeWeight: number;
  /** 0 to 1 weight on minimizing backtracking / inefficient loops */
  minimizeBacktrackingWeight: number;
  /** 0 to 1 weight on aligning with user interests */
  maximizeInterestAlignmentWeight: number;
  /** 0 to 1 weight on preserving comfortable safety buffer */
  preserveBufferWeight: number;
  /** 0 to 1 weight on category diversity */
  diversityWeight?: number;
  /** 0 to 1 weight on provider data richness / quality */
  qualityWeight?: number;
}

export interface OptimizerInput {
  constraints: TripConstraints;
  candidates: CandidatePlace[];
  routeMatrix: DirectionalRouteMatrix;
  startLocation?: LocationPoint;
  endLocation?: LocationPoint;
  pinnedPlaceIds?: string[];
  objectives?: Partial<OptimizationObjectives>;
  bufferPolicy?: Partial<BufferPolicyConfig>;
  beamWidth?: number;
}

export interface ScheduledStopAssignment {
  placeId: string;
  name?: string;
  arrivalTime: string;
  departureTime: string;
  durationMinutes: number;
  travelMinutesFromPrevious: number;
  distanceMetersFromPrevious: number;
  estimatedCost?: number;
  openingStatus?: 'verified_open' | 'unverified' | 'waited_for_opening' | 'closed';
  costConfidence?: 'known' | 'estimated' | 'uncertain' | 'unknown' | 'free';
  durationConfidence?: 'provider' | 'category_default' | 'estimated';
}

export interface OptimizerOutput {
  isFeasible: boolean;
  orderedPlaceIds: string[];
  schedule: ScheduledStopAssignment[];
  plannedArrivalTimeAtEnd: string;
  plannedEndArrivalMinutes?: number;
  totalTravelMinutes: number;
  totalActivityMinutes: number;
  totalBufferMinutes: number;
  safetyBufferMinutes?: number;
  unusedAvailableMinutes?: number;
  totalCost: number;
  objectiveScore: number;
  scoreBreakdown?: OptimizerScoreBreakdown;
  rejectionReasons?: string[];
  diagnostics?: {
    statesGenerated: number;
    statesPruned: number;
    feasiblePlansFound: number;
    executionTimeMs: number;
    pruningReasons?: Record<string, number>;
  };
}
