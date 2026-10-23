/**
 * Domain types for Trip Copilot Chatbot, Action Engine, and State Management.
 *
 * Architecture Principles:
 * - Authoritative State: Trip Copilot operates directly on shared PlannerState, TripConstraints, and FinalItinerary.
 * - Zero Direct Text Mutation: The LLM produces typed tool/action calls; deterministic services execute them.
 * - Non-Destructive What-Ifs: Simulations run on cloned state without corrupting the authoritative trip.
 * - Rollback Safety: Failed actions or constraint breaches automatically revert to the previous valid plan.
 * - Grounded Explanations: Explanations are derived strictly from structured diffs and provider facts.
 */

import {
  ConstraintChange,
  FinalItinerary,
  PlannerState,
  TravelMode,
  TripConstraints,
} from '../domain';

/**
 * Four distinct Conversational Intelligence Modes
 */
export type ConversationMode =
  | 'GENERAL_CONVERSATION'
  | 'CURRENT_PLAN_QUESTION'
  | 'SIMULATION_AND_RECOMMENDATION'
  | 'ACTION_EXECUTION';

/**
 * Structured User Preference Memory tracked across conversation turns
 */
export interface CopilotUserPreferences {
  preferredCategories: string[];
  dislikedCategories: string[];
  crowdPreference?: 'low' | 'moderate' | 'any';
  pacePreference?: 'relaxed' | 'moderate' | 'packed';
  budgetSensitivity?: 'low' | 'moderate' | 'high';
  walkingTolerance?: 'low' | 'medium' | 'high';
  notes: string[];
}

/**
 * Pending proposal from a simulation or recommendation that can be confirmed in a follow-up turn
 */
export interface PendingActionProposal {
  actionType: CopilotActionType;
  parameters: Record<string, unknown>;
  description: string;
  proposedAt?: string;
}

/**
 * Controlled Copilot Action Types
 */
export type CopilotActionType =
  // Itinerary Modifications
  | 'ADD_PLACE'
  | 'REMOVE_PLACE'
  | 'REPLACE_PLACE'
  | 'REORDER_PLACE'
  | 'MAKE_LESS_TIRING'
  // Constraint Modifications
  | 'CHANGE_BUDGET'
  | 'CHANGE_START_TIME'
  | 'CHANGE_END_TIME'
  | 'CHANGE_TIME'
  | 'CHANGE_START_DATE'
  | 'CHANGE_END_DATE'
  | 'CHANGE_TRAVEL_MODE'
  | 'CHANGE_NUMBER_OF_PEOPLE'
  | 'CHANGE_INTERESTS'
  | 'CHANGE_START_LOCATION'
  | 'CHANGE_END_LOCATION'
  // Non-destructive & Informational
  | 'SIMULATE_CHANGE'
  | 'UNDO_LAST_CHANGE'
  | 'SUGGEST_IMPROVEMENTS'
  | 'EXPLAIN_ITINERARY'
  | 'INFORMATIONAL_QUESTION'
  | 'GENERAL_CONVERSATION'
  | 'UPDATE_PREFERENCES'
  | 'SEARCH_PLACES'
  | 'GET_PLACE_DETAILS'
  | 'CLARIFICATION_NEEDED'
  | 'INFEASIBLE_REQUEST'
  | 'NO_OP';

/**
 * Structured Tool Arguments
 */
export interface AddPlaceArgs {
  placeName: string;
  forceInclude?: boolean;
  preferredPosition?: number;
}

export interface RemovePlaceArgs {
  placeName?: string;
  stopIndex?: number;
  stopId?: string;
}

export interface ReplacePlaceArgs {
  oldPlaceName?: string;
  oldStopIndex?: number;
  newPlaceName?: string;
  criteria?: {
    category?: string;
    isFree?: boolean;
    interest?: string;
    nearPlaceName?: string;
  };
}

export interface ReorderPlaceArgs {
  placeName: string;
  targetPosition: number; // 1-based index among visit stops
}

export interface ChangeBudgetArgs {
  total: number;
  currency?: string;
}

export interface ChangeTimeArgs {
  startTime?: string;
  latestArrivalTime?: string;
}

export interface ChangeTravelModeArgs {
  travelMode: TravelMode;
}

export interface ChangePeopleArgs {
  numberOfPeople: number;
}

export interface ChangeInterestsArgs {
  interests: string[];
  mode?: 'replace' | 'add' | 'remove';
}

export interface ChangeLocationArgs {
  type: 'start' | 'end';
  locationName: string;
}

export interface SimulateChangeArgs {
  actionType: CopilotActionType;
  parameters: Record<string, unknown>;
}

export interface ExplainArgs {
  topic?: string;
  question?: string;
}

/**
 * Compact Structured Trip Context sent to LLM for natural reasoning
 */
export interface CopilotTripContext {
  city: string;
  startPoint: { name: string; coordinates?: { lat: number; lng: number } };
  endPoint: { name: string; coordinates?: { lat: number; lng: number } };
  timeWindow: { startTime: string; latestArrivalTime: string };
  budget: { total: number; currency: string; spent: number; remaining: number };
  travelMode: TravelMode;
  numberOfPeople: number;
  interests: string[];
  currentStops: Array<{
    index: number;
    title: string;
    placeId?: string;
    arrivalTime: string;
    departureTime: string;
    durationMinutes: number;
    costTotal: number;
    category?: string;
    isFree: boolean;
  }>;
  totalTravelMinutes: number;
  totalActivityMinutes: number;
  safetyBufferMinutes: number;
  unusedAvailableMinutes: number;
  plannedArrivalTime: string;
  deadlineArrivalTime: string;
  availableCandidateSample: Array<{
    name: string;
    category?: string;
    estimatedCost: number;
  }>;
  recentChanges?: string[];
  canUndo: boolean;
  userPreferences?: CopilotUserPreferences;
  pendingProposal?: PendingActionProposal;
  lastDiscussedPlace?: string;
  hasItinerary: boolean;
  planningWindowMinutes: number;
}

/**
 * Change Diff structure highlighting before/after delta
 */
export interface CopilotDiff {
  addedStops: string[];
  removedStops: string[];
  reorderedStops?: string[];
  costChange?: { from: number; to: number; currency: string };
  arrivalTimeChange?: { from: string; to: string };
  safetyBufferChange?: { from: number; to: number };
  unusedTimeChange?: { from: number; to: number };
  constraintChanges?: ConstraintChange[];
}

/**
 * Session-level Undo Stack Entry
 */
export interface CopilotHistoryItem {
  id: string;
  timestamp: string;
  actionType: CopilotActionType;
  description: string;
  constraints: TripConstraints;
  itinerary: FinalItinerary;
  plannerState?: PlannerState;
}

/**
 * Chat Message in Copilot interface
 */
export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  conversationMode?: ConversationMode;
  actionExecuted?: CopilotActionType;
  actionParameters?: Record<string, unknown>;
  isSimulation?: boolean;
  diff?: CopilotDiff;
  suggestedActions?: string[];
  infeasibleNotice?: string;
  pendingProposal?: PendingActionProposal;
  discussedPlace?: string;
  actionLinks?: {
    googleMapsUrl?: string;
    directionsUrl?: string;
  };
}

/**
 * Tool Decision produced by intent classifier
 */
export interface CopilotToolDecision {
  actionType: CopilotActionType;
  conversationMode?: ConversationMode;
  parameters: Record<string, unknown>;
  isSimulation: boolean;
  isQuestionOnly: boolean;
  requiresClarification: boolean;
  clarificationQuestion?: string;
  conversationalReply?: string;
  discussedPlace?: string;
  preferenceUpdate?: Partial<CopilotUserPreferences>;
  pendingProposal?: PendingActionProposal;
  infeasibleReason?: string;
  reasoning: string;
}

/**
 * Engine Execution Result
 */
export interface CopilotEngineResult {
  success: boolean;
  reply: string;
  conversationMode?: ConversationMode;
  actionExecuted?: CopilotActionType;
  isSimulation?: boolean;
  diff?: CopilotDiff;
  updatedConstraints?: TripConstraints;
  updatedItinerary?: FinalItinerary;
  updatedPlannerState?: PlannerState;
  updatedHistory?: CopilotHistoryItem[];
  updatedPreferences?: CopilotUserPreferences;
  pendingProposal?: PendingActionProposal;
  lastDiscussedPlace?: string;
  toolsCalled?: string[];
  suggestedActions?: string[];
  infeasibleNotice?: string;
  actionLinks?: {
    googleMapsUrl?: string;
    directionsUrl?: string;
  };
  error?: string;
}

