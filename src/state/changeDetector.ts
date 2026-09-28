/**
 * Constraint Change Detector.
 *
 * Core Requirement:
 * When the user modifies any input:
 * 1. Detect exactly what changed.
 * 2. Identify whether affected routes, costs, or candidates need recalculation.
 * 3. Supply structured diffs to the replanner agent.
 */

import { ConstraintChange, TripConstraints } from '@/domain';

export function detectConstraintChanges(
  previous: TripConstraints,
  current: TripConstraints
): ConstraintChange[] {
  const changes: ConstraintChange[] = [];

  // City change -> completely new candidates, routes, matrix
  if (previous.city.trim().toLowerCase() !== current.city.trim().toLowerCase()) {
    changes.push({
      field: 'city',
      label: 'City Destination',
      oldValue: previous.city,
      newValue: current.city,
      requiresCandidateRetrieval: true,
      requiresRouteRecalculation: true,
      requiresCostRecalculation: true,
      description: `Target city changed from ${previous.city} to ${current.city}`,
    });
  }

  // Starting point change -> route recalculation for first leg
  if (
    previous.startingPoint.name !== current.startingPoint.name ||
    previous.startingPoint.coordinates.lat !== current.startingPoint.coordinates.lat ||
    previous.startingPoint.coordinates.lng !== current.startingPoint.coordinates.lng
  ) {
    changes.push({
      field: 'startingPoint',
      label: 'Starting Point',
      oldValue: previous.startingPoint.name,
      newValue: current.startingPoint.name,
      requiresCandidateRetrieval: false,
      requiresRouteRecalculation: true,
      requiresCostRecalculation: false,
      description: `Starting location changed to ${current.startingPoint.name}`,
    });
  }

  // End point change -> route recalculation for final leg & deadline check
  if (
    previous.endPoint.name !== current.endPoint.name ||
    previous.endPoint.coordinates.lat !== current.endPoint.coordinates.lat ||
    previous.endPoint.coordinates.lng !== current.endPoint.coordinates.lng
  ) {
    changes.push({
      field: 'endPoint',
      label: 'End Point / Destination Deadline',
      oldValue: previous.endPoint.name,
      newValue: current.endPoint.name,
      requiresCandidateRetrieval: false,
      requiresRouteRecalculation: true,
      requiresCostRecalculation: false,
      description: `End point destination changed to ${current.endPoint.name}`,
    });
  }

  // Travel mode change -> ALL route durations & distance matrix must be recalculated
  if (previous.travelMode !== current.travelMode) {
    changes.push({
      field: 'travelMode',
      label: 'Travel Mode',
      oldValue: previous.travelMode,
      newValue: current.travelMode,
      requiresCandidateRetrieval: false,
      requiresRouteRecalculation: true,
      requiresCostRecalculation: false,
      description: `Travel mode switched from ${previous.travelMode} to ${current.travelMode}`,
    });
  }

  // Budget change -> prune or re-admit candidate stops
  if (
    previous.budget.total !== current.budget.total ||
    previous.budget.currency !== current.budget.currency
  ) {
    changes.push({
      field: 'budget.total',
      label: 'Budget Limit',
      oldValue: `${previous.budget.currency} ${previous.budget.total}`,
      newValue: `${current.budget.currency} ${current.budget.total}`,
      requiresCandidateRetrieval: false,
      requiresRouteRecalculation: false,
      requiresCostRecalculation: true,
      description: `Trip budget changed to ${current.budget.currency} ${current.budget.total}`,
    });
  }

  // Available start time change
  if (previous.time.startTime !== current.time.startTime) {
    changes.push({
      field: 'time.startTime',
      label: 'Start Time',
      oldValue: previous.time.startTime,
      newValue: current.time.startTime,
      requiresCandidateRetrieval: false,
      requiresRouteRecalculation: false,
      requiresCostRecalculation: false,
      description: `Trip departure time shifted from ${previous.time.startTime} to ${current.time.startTime}`,
    });
  }

  // Latest arrival time change (deadline)
  if (previous.time.latestArrivalTime !== current.time.latestArrivalTime) {
    changes.push({
      field: 'time.latestArrivalTime',
      label: 'Deadline Arrival Time',
      oldValue: previous.time.latestArrivalTime,
      newValue: current.time.latestArrivalTime,
      requiresCandidateRetrieval: false,
      requiresRouteRecalculation: false,
      requiresCostRecalculation: false,
      description: `Required end-point arrival deadline changed to ${current.time.latestArrivalTime}`,
    });
  }

  // Number of people change -> budget per person recalculation
  if (previous.numberOfPeople !== current.numberOfPeople) {
    changes.push({
      field: 'numberOfPeople',
      label: 'Number of Travelers',
      oldValue: previous.numberOfPeople,
      newValue: current.numberOfPeople,
      requiresCandidateRetrieval: false,
      requiresRouteRecalculation: false,
      requiresCostRecalculation: true,
      description: `Party size adjusted from ${previous.numberOfPeople} to ${current.numberOfPeople}`,
    });
  }

  // Interests change
  const oldInterests = new Set(previous.interests);
  const isInterestsDifferent =
    previous.interests.length !== current.interests.length ||
    current.interests.some((i) => !oldInterests.has(i));

  if (isInterestsDifferent) {
    changes.push({
      field: 'interests',
      label: 'Travel Interests & Preferences',
      oldValue: previous.interests.join(', '),
      newValue: current.interests.join(', '),
      requiresCandidateRetrieval: true,
      requiresRouteRecalculation: false,
      requiresCostRecalculation: false,
      description: `Interests updated to: ${current.interests.join(', ')}`,
    });
  }

  return changes;
}
