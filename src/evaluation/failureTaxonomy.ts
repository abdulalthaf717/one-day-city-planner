/**
 * Failure Taxonomy & Recovery Strategy Definitions.
 *
 * Provides a structured catalog of all anticipated failure modes across the
 * end-to-end One-Day City Planner pipeline, their diagnostic signatures,
 * automated recovery mechanisms, and guaranteed deterministic outcomes.
 */

import { FailureCategory, FailureTaxonomyEntry } from './types';

export const SYSTEM_FAILURE_TAXONOMY: Record<FailureCategory, FailureTaxonomyEntry> = {
  LOCATION_RESOLUTION_FAILURE: {
    category: 'LOCATION_RESOLUTION_FAILURE',
    stage: 'input',
    detectedCause: 'Geocoding service returned zero matching coordinates for start or destination text.',
    recoveryAction: 'Intercept pre-flight, prompt user for neighborhood or city qualifier, zero fake coordinates.',
    finalOutcome: 'user_action_required',
  },
  NO_CANDIDATES: {
    category: 'NO_CANDIDATES',
    stage: 'discovery',
    detectedCause: 'Candidate discovery returned zero places matching specific narrow categories.',
    recoveryAction: 'Broaden search radius across travel corridor or fall back to balanced general tourist categories.',
    finalOutcome: 'recovered',
  },
  NO_FEASIBLE_ROUTE: {
    category: 'NO_FEASIBLE_ROUTE',
    stage: 'routing',
    detectedCause: 'Missing road connection or non-traversable segment between two candidate locations.',
    recoveryAction: 'Prune disconnected candidate from graph traversal, preserve connected subgraph.',
    finalOutcome: 'recovered',
  },
  BUDGET_CONFLICT: {
    category: 'BUDGET_CONFLICT',
    stage: 'optimization',
    detectedCause: 'Sum of candidate admission/spend exceeds user total budget limit.',
    recoveryAction: 'Optimizer beam search prunes high-cost candidates, prioritizing free public sights and parks.',
    finalOutcome: 'recovered',
  },
  TIME_CONFLICT: {
    category: 'TIME_CONFLICT',
    stage: 'optimization',
    detectedCause: 'Combined transit time and visit durations exceed start-to-deadline window.',
    recoveryAction: 'Optimizer prunes lowest utility stops until total elapsed time plus safety buffer fits deadline.',
    finalOutcome: 'recovered',
  },
  OPENING_HOURS_CONFLICT: {
    category: 'OPENING_HOURS_CONFLICT',
    stage: 'optimization',
    detectedCause: 'Candidate place is closed during arrival time window or opens after departure.',
    recoveryAction: 'Discard candidate during node expansion in beam search; do not schedule visits during closed hours.',
    finalOutcome: 'recovered',
  },
  ENDPOINT_DEADLINE_CONFLICT: {
    category: 'ENDPOINT_DEADLINE_CONFLICT',
    stage: 'validation',
    detectedCause: 'Final arrival at destination exceeds user latestArrivalTime or safety buffer is under 15m.',
    recoveryAction: 'Validator triggers recovery loop; agent prunes final intermediate detour stop and recalculates.',
    finalOutcome: 'recovered',
  },
  API_RATE_LIMIT: {
    category: 'API_RATE_LIMIT',
    stage: 'discovery',
    detectedCause: 'Geoapify (3,000 RPD) or Groq (1,000 RPD / 30 RPM) quota limit reached.',
    recoveryAction: 'Serve from in-memory PlacesCache and RouteMatrix cache; display respectful temporary wait message.',
    finalOutcome: 'graceful_fallback',
  },
  LLM_FAILURE: {
    category: 'LLM_FAILURE',
    stage: 'replanning',
    detectedCause: 'Groq API timeout, invalid JSON format, or rate limit during agent tool-selection decision.',
    recoveryAction: 'Fallback to deterministic rule-based planner pipeline and structured state diffs.',
    finalOutcome: 'recovered',
  },
  VISION_UNCERTAIN: {
    category: 'VISION_UNCERTAIN',
    stage: 'vision',
    detectedCause: 'Groq vision confidence score < 0.80 or ambiguous landmark recognition.',
    recoveryAction: 'Present candidate alternatives list for user manual selection; do not automatically inject stop.',
    finalOutcome: 'user_action_required',
  },
  PLACE_VERIFICATION_FAILURE: {
    category: 'PLACE_VERIFICATION_FAILURE',
    stage: 'vision',
    detectedCause: 'Visual prediction could not be verified against factual Geoapify places database.',
    recoveryAction: 'Flag candidate as unverified, display warning badge, refuse automatic route addition.',
    finalOutcome: 'rejected',
  },
  UNKNOWN_COST: {
    category: 'UNKNOWN_COST',
    stage: 'optimization',
    detectedCause: 'Attraction admission fee not published in Geoapify provider metadata.',
    recoveryAction: 'Explicitly mark costSource as "unknown", do not treat as ₹0 silently, display counter note.',
    finalOutcome: 'recovered',
  },
  UNSUPPORTED_TRAVEL_MODE: {
    category: 'UNSUPPORTED_TRAVEL_MODE',
    stage: 'input',
    detectedCause: 'Travel mode not supported by routing engine (e.g. "submarine", "flight").',
    recoveryAction: 'Pre-flight schema validation rejects mode, restricts to drive/walk/bicycle/transit.',
    finalOutcome: 'rejected',
  },
};
