/**
 * Domain types for deterministic validation and structured failure diagnostics.
 */

export type ValidationStatus = 'VALID' | 'INVALID';

export type ValidationErrorCode =
  | 'BUDGET_EXCEEDED'
  | 'END_TIME_VIOLATED'
  | 'START_TIME_INVALID'
  | 'PLACE_CLOSED'
  | 'INSUFFICIENT_VISIT_DURATION'
  | 'TRAVEL_LEG_INFEASIBLE'
  | 'UNSUPPORTED_TRAVEL_MODE'
  | 'INSUFFICIENT_BUFFER'
  | 'MISSING_START_POINT'
  | 'MISSING_END_POINT'
  | 'NO_FEASIBLE_STOPS'
  | 'INVALID_START_POINT'
  | 'INVALID_END_POINT'
  | 'CHRONOLOGY_VIOLATION'
  | 'ACTIVITY_OVERLAP'
  | 'INSUFFICIENT_TRAVEL_TIME'
  | 'OPENING_HOURS_VIOLATED'
  | 'TRAVEL_MODE_MISMATCH'
  | 'NEGATIVE_SAFETY_BUFFER'
  | 'MISSING_ROUTE_LEG'
  | 'DUPLICATE_PLACE_VISIT';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  targetPlaceId?: string;
  targetPlaceName?: string;
  excessAmount?: number;
  excessMinutes?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  targetPlaceId?: string;
}

export interface ValidationMetrics {
  totalCost: number;
  budgetLimit: number;
  remainingBudget: number;
  totalDurationMinutes: number;
  availableMinutes: number;
  safetyBufferMinutes: number;
  deadlineRespected: boolean;
}

export interface ValidationResult {
  status: ValidationStatus;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metrics: ValidationMetrics;
  validatedAt: string;
}
