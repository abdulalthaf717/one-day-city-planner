/**
 * Domain types for application session state, change tracking, and multimodal workflows.
 */

import { LocationPoint, TripConstraints } from './constraints';
import { FinalItinerary } from './itinerary';
import { OptimizerOutput } from './optimizer';
import { CandidatePlace } from './places';
import { DirectionalRouteMatrix } from './routing';
import { ValidationResult } from './validation';

export type AgentToolName =
  | 'resolve_locations'
  | 'discover_candidates'
  | 'calculate_route_matrix'
  | 'optimize_itinerary'
  | 'validate_itinerary'
  | 'analyze_uploaded_image';

export interface PlanningConfidence {
  routeConfidence: 'high' | 'medium' | 'low';
  routeModelNote: string;
  placeDataConfidence: 'verified' | 'mixed' | 'unverified';
  openingHoursConfidence: 'verified' | 'partial' | 'unverified';
  costConfidence: 'known' | 'estimated' | 'mixed' | 'uncertain';
  overallPlanningConfidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface PlanningIterationDiagnostic {
  iteration: number;
  decision: 'CALL_TOOL' | 'FINALIZE' | 'REPLAN' | 'FAILED' | 'ASK_USER';
  toolCalled?: AgentToolName;
  toolArguments?: Record<string, unknown>;
  toolResultSummary?: string;
  reason: string;
  timestamp: string;
  durationMs?: number;
}

export type AgentDecision =
  | {
      decision: 'CALL_TOOL';
      tool: AgentToolName;
      arguments: Record<string, unknown>;
      reason: string;
    }
  | {
      decision: 'FINALIZE';
      reason: string;
      explanation?: string;
    }
  | {
      decision: 'REPLAN';
      reason: string;
      prunePlaceIds?: string[];
      adjustBufferMinutes?: number;
    }
  | {
      decision: 'ASK_USER';
      missingField: string;
      question: string;
    }
  | {
      decision: 'FAILED';
      reason: string;
    };

export interface PlannerState {
  tripConstraints: TripConstraints;
  previousConstraints?: TripConstraints;
  changedFields?: ConstraintChange[];
  resolvedStart?: LocationPoint;
  resolvedEnd?: LocationPoint;
  candidates?: CandidatePlace[];
  routeMatrix?: DirectionalRouteMatrix;
  currentItinerary?: FinalItinerary;
  validationResult?: ValidationResult;
  optimizerDiagnostics?: OptimizerOutput['diagnostics'];
  planningVersion: number;
  warnings: string[];
  explanation?: string;
  confidence?: PlanningConfidence;
}

export type PlanningStatus =
  | 'idle'
  | 'analyzing'
  | 'retrieving_places'
  | 'calculating_matrix'
  | 'optimizing'
  | 'validating'
  | 'replanning'
  | 'ready'
  | 'error';

export interface ConstraintChange {
  field: keyof TripConstraints | 'time.startTime' | 'time.latestArrivalTime' | 'budget.total';
  label: string;
  oldValue: unknown;
  newValue: unknown;
  requiresRouteRecalculation: boolean;
  requiresCostRecalculation: boolean;
  requiresCandidateRetrieval: boolean;
  description: string;
}

export interface MultimodalPendingPlace {
  id: string;
  imageFileName: string;
  imagePreviewUrl?: string;
  identifiedName: string;
  identifiedType?: 'tourist_place' | 'food' | 'event_poster' | 'tourism_map' | 'unrecognized';
  confidence: 'high' | 'medium' | 'low';
  confidenceScore?: number;
  llmReasoning: string;
  verifiedPlace?: CandidatePlace;
  isVerified: boolean;
  status: 'pending_user_decision' | 'accepted' | 'declined' | 'infeasible';
  feasibilityFeedback?: string;
  possibleAlternatives?: Array<{ name: string; city?: string; address?: string; placeId?: string }>;
  eventDetails?: {
    eventName?: string;
    date?: string;
    time?: string;
    venue?: string;
    category?: string;
  };
  mapExtractedPlaces?: string[];
  feasibilityDetails?: {
    canFit: boolean;
    remainingBufferMinutes?: number;
    visitDurationMinutes?: number;
    additionalTravelMinutes?: number;
    delayMinutes?: number;
    costIncrease?: number;
    reason: string;
  };
}

export interface TripPlannerHistoryEntry {
  version: number;
  timestamp: string;
  constraints: TripConstraints;
  itinerary: FinalItinerary;
  changeSummary?: string;
}

export interface TripPlannerSessionState {
  version: number;
  status: PlanningStatus;
  statusMessage?: string;
  constraints: TripConstraints;
  previousConstraints?: TripConstraints;
  detectedChanges: ConstraintChange[];
  candidates: CandidatePlace[];
  routeMatrix?: DirectionalRouteMatrix;
  itinerary: FinalItinerary | null;
  history: TripPlannerHistoryEntry[];
  validation: ValidationResult | null;
  activeImageUpload: MultimodalPendingPlace | null;
  errorMessage: string | null;
}
