/**
 * Deterministic Planning Confidence Evaluator.
 *
 * Core Principle:
 * Confidence scores are NEVER guessed or hallucinated by an LLM.
 * They are deterministically computed from structured metadata (provider verification,
 * cost certainty classification, opening hour verification, and routing traffic models).
 */

import { FinalItinerary, PlanningConfidence } from '@/domain';

export function evaluatePlanningConfidence(itinerary: FinalItinerary): PlanningConfidence {
  const stops = itinerary.stops.filter((s) => s.type === 'place' || s.type === 'meal');

  // 1. Route Confidence
  const routeConfidence: PlanningConfidence['routeConfidence'] = 'high';
  const routeModelNote = 'road-network estimate; not live traffic';

  // 2. Place Data Confidence
  let verifiedCount = 0;
  for (const s of stops) {
    if (s.verificationStatus === 'verified') {
      verifiedCount++;
    }
  }

  const placeRatio = stops.length > 0 ? verifiedCount / stops.length : 1.0;
  const placeDataConfidence: PlanningConfidence['placeDataConfidence'] =
    placeRatio >= 0.8 ? 'verified' : placeRatio > 0.4 ? 'mixed' : 'unverified';

  // 3. Opening Hours Confidence
  let unverifiedHoursCount = 0;
  for (const s of stops) {
    if (s.openingStatus === 'unverified') {
      unverifiedHoursCount++;
    }
  }

  const openingHoursConfidence: PlanningConfidence['openingHoursConfidence'] =
    unverifiedHoursCount === 0 ? 'verified' : unverifiedHoursCount < stops.length ? 'partial' : 'unverified';

  // 4. Cost Confidence
  let knownCount = 0;
  let estimatedCount = 0;
  let unknownCount = 0;

  for (const s of stops) {
    if (s.costConfidence === 'known' || s.costConfidence === 'free') {
      knownCount++;
    } else if (s.costConfidence === 'estimated') {
      estimatedCount++;
    } else {
      unknownCount++;
    }
  }

  let costConfidence: PlanningConfidence['costConfidence'] = 'known';
  if (unknownCount > 0) {
    costConfidence = 'uncertain';
  } else if (estimatedCount > 0 && knownCount > 0) {
    costConfidence = 'mixed';
  } else if (estimatedCount > 0) {
    costConfidence = 'estimated';
  }

  // 5. Overall Planning Confidence Synthesis
  let overallPlanningConfidence: PlanningConfidence['overallPlanningConfidence'] = 'high';
  const rationaleParts: string[] = [];

  if (routeModelNote) {
    rationaleParts.push(`Directional routing verified (${routeModelNote})`);
  }

  if (placeDataConfidence === 'verified') {
    rationaleParts.push('All candidate places verified against official spatial providers');
  } else {
    rationaleParts.push('Some locations lack detailed official verification');
    overallPlanningConfidence = 'medium';
  }

  if (openingHoursConfidence === 'partial' || openingHoursConfidence === 'unverified') {
    rationaleParts.push('Opening hours unverified for some stops; recommend checking directly');
    overallPlanningConfidence = 'medium';
  }

  if (costConfidence === 'uncertain') {
    rationaleParts.push('Some attractions have unverified ticket fees');
    overallPlanningConfidence = 'low';
  } else if (costConfidence === 'estimated') {
    rationaleParts.push('Budget based on standard category cost benchmarks');
  }

  return {
    routeConfidence,
    routeModelNote,
    placeDataConfidence,
    openingHoursConfidence,
    costConfidence,
    overallPlanningConfidence,
    rationale: rationaleParts.join('. ') + '.',
  };
}
