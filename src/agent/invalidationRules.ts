/**
 * Surgical State Invalidation Rules for Dynamic Replanning.
 *
 * Core Requirement:
 * When a user modifies constraints on an existing plan:
 * 1. Identify which calculation layers are invalidated.
 * 2. Reuse intact, valid state components (candidates, route matrices, geocoded coordinates).
 * 3. Never repeat expensive API operations unnecessarily.
 */

import { ConstraintChange } from '@/domain';

export interface InvalidationPlan {
  invalidateStartGeocoding: boolean;
  invalidateEndGeocoding: boolean;
  invalidateCandidates: boolean;
  invalidateRouteMatrix: boolean;
  invalidateOptimizer: boolean;
  invalidateValidator: boolean;
  reusableComponents: string[];
  reasons: string[];
}

export function computeInvalidationPlan(changes: ConstraintChange[]): InvalidationPlan {
  let invalidateStartGeocoding = false;
  let invalidateEndGeocoding = false;
  let invalidateCandidates = false;
  let invalidateRouteMatrix = false;
  const invalidateOptimizer = true; // Any constraint change necessitates re-optimization
  const invalidateValidator = true;

  const reusableComponents: string[] = [];
  const reasons: string[] = [];

  for (const change of changes) {
    const field = change.field;

    switch (field) {
      case 'city':
        invalidateStartGeocoding = true;
        invalidateEndGeocoding = true;
        invalidateCandidates = true;
        invalidateRouteMatrix = true;
        reasons.push('City destination changed: entire location, candidate pool, and route matrix invalidated.');
        break;

      case 'startingPoint':
        invalidateStartGeocoding = true;
        invalidateRouteMatrix = true;
        reasons.push('Starting location changed: initial route leg and route matrix invalidated; candidate pool preserved.');
        break;

      case 'endPoint':
        invalidateEndGeocoding = true;
        invalidateRouteMatrix = true;
        reasons.push('End point destination changed: final route leg and route matrix invalidated; candidate pool preserved.');
        break;

      case 'travelMode':
        invalidateRouteMatrix = true;
        reasons.push(`Travel mode changed (${change.oldValue} -> ${change.newValue}): route matrix invalidated; locations and candidates preserved.`);
        break;

      case 'interests':
        invalidateCandidates = true;
        invalidateRouteMatrix = true;
        reasons.push('Interests updated: candidate pool and associated route matrix invalidated; start/end locations preserved.');
        break;

      case 'budget.total':
      case 'numberOfPeople':
        // Candidate pool and route matrix remain 100% valid! Only optimizer and validator rerun.
        reasons.push(`${change.label} modified: candidate pool and road route matrix preserved; re-evaluating cost feasibility.`);
        break;

      case 'time.startTime':
      case 'time.latestArrivalTime':
        // Time window changed: candidates and matrix are intact!
        reasons.push(`Trip window changed (${change.label}): candidate pool and route matrix preserved; re-evaluating time windows and buffers.`);
        break;

      default:
        reasons.push(`Constraint "${String(field)}" modified.`);
        break;
    }
  }

  if (!invalidateStartGeocoding) reusableComponents.push('startLocation');
  if (!invalidateEndGeocoding) reusableComponents.push('endLocation');
  if (!invalidateCandidates) reusableComponents.push('candidates');
  if (!invalidateRouteMatrix) reusableComponents.push('routeMatrix');

  return {
    invalidateStartGeocoding,
    invalidateEndGeocoding,
    invalidateCandidates,
    invalidateRouteMatrix,
    invalidateOptimizer,
    invalidateValidator,
    reusableComponents,
    reasons,
  };
}
