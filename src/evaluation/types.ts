/**
 * Evaluation Framework Types & Contracts.
 *
 * Provides typed schemas for benchmark scenarios, metrics, failure analysis,
 * and recovery demonstrations for the capstone rubric evaluation.
 */

import {
  CandidatePlace,
  DirectionalRouteMatrix,
  LocationPoint,
  TripConstraints,
  ValidationResult,
} from '@/domain';

export type FailureCategory =
  | 'LOCATION_RESOLUTION_FAILURE'
  | 'NO_CANDIDATES'
  | 'NO_FEASIBLE_ROUTE'
  | 'BUDGET_CONFLICT'
  | 'TIME_CONFLICT'
  | 'OPENING_HOURS_CONFLICT'
  | 'ENDPOINT_DEADLINE_CONFLICT'
  | 'API_RATE_LIMIT'
  | 'LLM_FAILURE'
  | 'VISION_UNCERTAIN'
  | 'PLACE_VERIFICATION_FAILURE'
  | 'UNKNOWN_COST'
  | 'UNSUPPORTED_TRAVEL_MODE';

export interface FailureTaxonomyEntry {
  category: FailureCategory;
  stage: 'input' | 'discovery' | 'routing' | 'optimization' | 'validation' | 'vision' | 'replanning';
  detectedCause: string;
  recoveryAction: string;
  finalOutcome: 'recovered' | 'graceful_fallback' | 'user_action_required' | 'rejected';
}

export interface EvaluationScenario {
  id: string;
  name: string;
  category:
    | 'standard'
    | 'time_stress'
    | 'budget_stress'
    | 'preference'
    | 'travel_mode'
    | 'corridor'
    | 'replanning'
    | 'edge_case'
    | 'multimodal';
  description: string;
  constraints: TripConstraints;
  fixtures: {
    startLocation: LocationPoint;
    endLocation: LocationPoint;
    candidates: CandidatePlace[];
    routeMatrix: DirectionalRouteMatrix;
  };
  expectedOutcomes: {
    expectFeasible: boolean;
    maxPlannedCost?: number;
    mustArriveBeforeLatest: boolean;
    requiredStopIds?: string[];
    forbiddenStopIds?: string[];
    minVisitedStops?: number;
    maxVisitedStops?: number;
  };
}

export interface ScenarioEvaluationResult {
  scenarioId: string;
  scenarioName: string;
  category: string;
  passed: boolean;
  isFeasible: boolean;
  actualArrival: string;
  latestAllowedArrival: string;
  deadlineCompliant: boolean;
  totalCost: number;
  budgetCompliant: boolean;
  openingHoursCompliant: boolean;
  routeFeasible: boolean;
  visitedStopsCount: number;
  visitedStopNames: string[];
  latencyMs: number;
  validationResult: ValidationResult;
  noFabricationVerified: boolean;
  notes?: string;
}

export interface EvaluationMetricsSummary {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  constraintSuccessRate: number; // validPlans / totalEvaluatedPlans
  deadlineComplianceRate: number;
  budgetComplianceRate: number;
  openingHoursComplianceRate: number;
  routeFeasibilityRate: number;
  replanningSuccessRate: number;
  imageVerificationSuccessRate: number;
  imageAddToTripSuccessRate: number;
  noFabricationRate: number;
  deterministicReproducibilityRate: number;
  averageOptimizerLatencyMs: number;
  averagePlannerLatencyMs: number;
  averageApiCallsPerPlan: number;
  timestamp: string;
}

export interface RecoveryScenarioResult {
  id: string;
  name: string;
  failureCategory: FailureCategory;
  initialTrigger: string;
  detectedCause: string;
  recoveryStrategy: string;
  recoveredSuccessfully: boolean;
  validatedOutcome: string;
}
