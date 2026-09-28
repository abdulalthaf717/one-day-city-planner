/**
 * Service interfaces for Groq LLM reasoning, structured planner decisions,
 * and multimodal image understanding preparation.
 *
 * Free-Tier Rule: Must use Groq free-tier models (default: qwen/qwen3.8-27b).
 *
 * Boundary principle:
 * LLM handles:
 * - Natural-language comprehension
 * - Structured tool selection reasoning
 * - Interpreting optional user preferences
 * - Landmark/poster image reasoning (prepared for M6)
 * - Factual replanning trade-off explanations
 *
 * LLM NEVER handles:
 * - Authoritative travel times or distances
 * - Route ordering math
 * - Budget totals
 * - Hard constraint validation
 */

import { ConstraintChange, TripConstraints } from '@/domain';

export type PlannerToolName =
  | 'resolve_locations'
  | 'discover_candidates'
  | 'calculate_route_matrix'
  | 'optimize_itinerary'
  | 'validate_itinerary';

export interface PlannerDecision {
  decision: 'CALL_TOOL' | 'FINALIZE' | 'ASK_USER' | 'REPLAN';
  tool?: PlannerToolName;
  arguments?: Record<string, unknown>;
  reason: string;
}

export interface PlannerDecisionContext {
  constraints: TripConstraints;
  state: {
    hasResolvedStart: boolean;
    hasResolvedEnd: boolean;
    candidateCount: number;
    hasRouteMatrix: boolean;
    hasItinerary: boolean;
    validationStatus?: string;
  };
  iteration: number;
  lastToolResultSummary?: string;
}

export interface SemanticPreferenceAnalysis {
  inferredInterests: string[];
  recommendedCategories: string[];
  suggestedPace: 'relaxed' | 'moderate' | 'packed';
  reasoning: string;
}

export interface LandmarkImageAnalysis {
  identifiedType: 'tourist_place' | 'food' | 'event_poster' | 'tourism_map' | 'unrecognized';
  identifiedName: string;
  city?: string;
  description: string;
  categorySuggestion: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  reasoning: string;
  searchQueryForVerification: string;
  isAmbiguous: boolean;
  possibleAlternatives: string[];
  eventDetails?: {
    eventName?: string;
    date?: string;
    time?: string;
    venue?: string;
    category?: string;
  };
  mapExtractedPlaces?: string[];
}

export interface ReplanningExplanationRequest {
  changedConstraints: ConstraintChange[];
  previousPlanBrief: string;
  newPlanBrief: string;
}

export interface IGroqService {
  /**
   * Generates a structured tool selection or finalization decision
   */
  getPlannerDecision(context: PlannerDecisionContext): Promise<PlannerDecision>;

  /**
   * Analyzes freeform user preferences or special requests into structured categories
   */
  interpretPreferences(
    rawText: string,
    currentConstraints: TripConstraints
  ): Promise<SemanticPreferenceAnalysis>;

  /**
   * Multimodal vision analysis of an uploaded tourist photograph or poster (Milestone 6 prepared)
   */
  analyzeLandmarkImage(
    imageBase64: string,
    mimeType: string,
    cityContext?: string
  ): Promise<LandmarkImageAnalysis>;

  /**
   * Explains why an itinerary changed after a constraint was modified
   */
  explainReplanning(
    request: ReplanningExplanationRequest
  ): Promise<string>;
}
