/**
 * Transparent Deterministic Candidate Scoring & Filtering Engine.
 *
 * Combines interest alignment, geographic corridor proximity, time feasibility,
 * budget compatibility, provider quality signal, and category diversity into an inspectable score.
 */

import {
  CandidatePlace,
  CandidateScoreBreakdown,
  Coordinates,
} from '@/domain';
import { calculateDetourDistanceKm, calculateHaversineDistance, PlanningCorridor } from './geographicCorridor';

export interface ScoringWeights {
  interestRelevance: number; // weight: 0.30
  geographicPracticality: number; // weight: 0.25
  openingCompatibility: number; // weight: 0.10
  budgetCompatibility: number; // weight: 0.10
  qualitySignal: number; // weight: 0.10
  diversityBonus: number; // weight: 0.10
  travelBurdenPenalty: number; // weight: 0.15
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  interestRelevance: 0.30,
  geographicPracticality: 0.25,
  openingCompatibility: 0.10,
  budgetCompatibility: 0.10,
  qualitySignal: 0.10,
  diversityBonus: 0.10,
  travelBurdenPenalty: 0.15,
};

export interface ScoringContext {
  start: Coordinates;
  end: Coordinates;
  corridor: PlanningCorridor;
  userInterests?: string[];
  matchedInterests?: string[];
  availableTripMinutes?: number;
  totalBudget?: number;
  perPersonBudget?: number;
  peopleCount?: number;
  categoryFrequencies?: Record<string, number>;
  weights?: Partial<ScoringWeights>;
}

/**
 * Computes transparent scores for a candidate place.
 */
export function scoreCandidate(
  place: CandidatePlace,
  context: ScoringContext
): {
  candidateScore: number;
  breakdown: CandidateScoreBreakdown;
  relevanceScore: number;
  qualityScore: number;
  travelBurdenScore: number;
} {
  const weights: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...context.weights };
  const point = place.coordinates;

  // 1. Interest Relevance (0 - 100)
  let relevanceScore = 50; // default baseline
  if (!context.userInterests || context.userInterests.length === 0) {
    // Balanced default: driven by the deterministic tourist relevance score!
    relevanceScore = place.touristRelevanceScore ?? 75;
  } else {
    const rawCatStr = (place.categories || []).join(' ').toLowerCase();
    const matched = (context.matchedInterests || []).filter((interest) =>
      rawCatStr.includes(interest.toLowerCase())
    );
    if (matched.length > 0) {
      // Direct category match with user interests
      const baseMatch = Math.min(100, 70 + matched.length * 15);
      relevanceScore = place.touristRelevanceScore
        ? Math.round(baseMatch * 0.6 + place.touristRelevanceScore * 0.4)
        : baseMatch;
    } else {
      relevanceScore = place.touristRelevanceScore
        ? Math.round(place.touristRelevanceScore * 0.4)
        : 35;
    }
  }

  // 2. Geographic Practicality (0 - 100)
  // Places closer to the direct corridor axis score higher
  const detourKm = calculateDetourDistanceKm(point, context.start, context.end);
  const maxAcceptableDetourKm = Math.max(12, context.corridor.spanKm * 0.45);
  const geoScore = Math.max(
    0,
    Math.min(100, Math.round(100 * (1 - detourKm / maxAcceptableDetourKm)))
  );

  // 3. Opening Hours Compatibility (0 - 100)
  let openingScore = 70; // neutral confidence when unknown
  if (place.openingHoursSource === 'provider' && place.openingHours) {
    openingScore = 95; // verified provider opening hours available
  } else if (place.openingHoursSource === 'unavailable') {
    openingScore = 65; // unverified/missing: slight discount, never presumed closed
  }

  // 4. Budget Compatibility (0 - 100)
  let budgetScore = 70; // baseline for unknown cost
  if (place.costSource === 'free') {
    budgetScore = 100;
  } else if (place.costSource === 'known' || place.costSource === 'estimated') {
    const costForGroup = place.cost.totalForGroup ?? (place.cost.amountPerPerson || 0) * (context.peopleCount || 1);
    const limit = context.totalBudget ?? (context.perPersonBudget ? context.perPersonBudget * (context.peopleCount || 1) : undefined);

    if (limit !== undefined && limit > 0) {
      if (costForGroup <= limit * 0.5) {
        budgetScore = 95; // well within budget
      } else if (costForGroup <= limit) {
        budgetScore = 80; // fits in budget
      } else if (costForGroup <= limit * 1.2) {
        budgetScore = 40; // slightly above budget
      } else {
        budgetScore = 10; // clearly expensive / impossible for budget
      }
    } else {
      budgetScore = 75;
    }
  } else {
    // costSource === 'unknown'
    // Under strict policy: unknown is not assumed cheap, but not penalized as if out-of-budget
    budgetScore = 60;
  }

  // 5. Quality Signal (0 - 100)
  let qualityScore = 50;
  if (typeof place.rating === 'number' && place.rating > 0) {
    // 0 to 5 mapped to 40 - 100
    qualityScore = Math.round(place.rating * 20);
    if (typeof place.ratingCount === 'number' && place.ratingCount > 50) {
      qualityScore = Math.min(100, qualityScore + 10);
    }
  } else {
    // Provider data richness boost
    let richness = 50;
    if (place.websiteUrl) richness += 15;
    if (place.address) richness += 10;
    if (place.name && place.name !== 'Unnamed Attraction') richness += 10;
    qualityScore = Math.min(85, richness);
  }

  // 6. Category Diversity Bonus (0 - 100)
  // Penalizes over-represented categories in the candidate pool
  const currentCount = context.categoryFrequencies?.[place.category] || 0;
  let diversityBonus = 80;
  if (currentCount === 0) {
    diversityBonus = 100; // First of its category gets maximum diversity bonus
  } else if (currentCount === 1) {
    diversityBonus = 85;
  } else if (currentCount === 2) {
    diversityBonus = 65;
  } else {
    diversityBonus = Math.max(20, 50 - (currentCount - 2) * 15);
  }

  // 7. Travel Burden (0 - 100, where higher means MORE burden)
  // Distance from start + distance to end
  const distFromStartKm = calculateHaversineDistance(context.start.lat, context.start.lng, point.lat, point.lng) / 1000;
  const distToEndKm = calculateHaversineDistance(context.end.lat, context.end.lng, point.lat, point.lng) / 1000;
  const totalTravelSpanKm = distFromStartKm + distToEndKm;
  const directSpanKm = context.corridor.spanKm;
  const excessRatio = totalTravelSpanKm / (directSpanKm || 1);

  // travelBurdenScore: 0 (near direct line) to 100 (excessive detour)
  const travelBurdenScore = Math.min(100, Math.max(0, Math.round((excessRatio - 1) * 60)));

  // If available trip duration is very short (e.g. 2 hours / 120 minutes):
  // distant places are heavily penalized on travel burden!
  let timeFeasibilityPenalty = 0;
  if (context.availableTripMinutes && context.availableTripMinutes <= 180) {
    // 2-3 hour window: visit duration + travel burden must be tight
    const visitMins = place.estimatedVisitDurationMinutes;
    if (visitMins > context.availableTripMinutes * 0.7) {
      timeFeasibilityPenalty = 30; // visit alone takes 70% of available time
    }
    if (detourKm > 8) {
      timeFeasibilityPenalty += 25; // distant detour in a short window
    }
  }

  // 8. Tourist Quality & Downweight Adjustments
  let qualityAdjustment = 0;
  const isReligiousPlace =
    place.category === 'religious' ||
    (place.categories || []).some((c) => c.includes('place_of_worship'));
  const userWantsReligion = (context.userInterests || []).some((i) =>
    /\b(relig|spirit|temple|church|mosque|masjid|worship|faith|shrine)\b/i.test(i)
  );

  if (isReligiousPlace && !userWantsReligion) {
    // Ordinary neighborhood worship places receive heavy downweight unless requested
    qualityAdjustment -= 35;
  }

  const isOrdinaryStatue =
    (place.categories || []).some((c) => c.includes('statue')) &&
    !(place.categories || []).some(
      (c) =>
        c.includes('monument') ||
        c.includes('memorial') ||
        c.includes('castle') ||
        c.includes('fort') ||
        c.includes('heritage')
    );
  if (isOrdinaryStatue) {
    qualityAdjustment -= 20;
  }

  const isGenericLocal =
    /\b(society|office|hall|kalyana mandapam|technical services|township|apartment)\b/i.test(
      place.name || ''
    );
  if (isGenericLocal) {
    qualityAdjustment -= 25;
  }

  // Composite Weighted Score Calculation
  const rawComposite =
    relevanceScore * weights.interestRelevance +
    geoScore * weights.geographicPracticality +
    openingScore * weights.openingCompatibility +
    budgetScore * weights.budgetCompatibility +
    qualityScore * weights.qualitySignal +
    diversityBonus * weights.diversityBonus -
    travelBurdenScore * weights.travelBurdenPenalty -
    timeFeasibilityPenalty +
    qualityAdjustment;

  const candidateScore = Math.max(1, Math.min(100, Math.round(rawComposite)));

  const breakdown: CandidateScoreBreakdown = {
    interestRelevance: Math.round(relevanceScore),
    geographicPracticality: Math.round(geoScore),
    openingCompatibility: Math.round(openingScore),
    budgetCompatibility: Math.round(budgetScore),
    qualitySignal: Math.round(qualityScore),
    diversityBonus: Math.round(diversityBonus),
    travelBurden: Math.round(travelBurdenScore),
    totalScore: candidateScore,
  };

  return {
    candidateScore,
    breakdown,
    relevanceScore: Math.round(relevanceScore),
    qualityScore: Math.round(qualityScore),
    travelBurdenScore: Math.round(travelBurdenScore),
  };
}

/**
 * Filter condition to eliminate unusable provider candidates.
 */
export function isCandidateFeasible(place: CandidatePlace, corridor: PlanningCorridor): {
  isFeasible: boolean;
  rejectionReason?: string;
} {
  // 1. Missing or invalid coordinates
  if (
    typeof place.latitude !== 'number' ||
    typeof place.longitude !== 'number' ||
    isNaN(place.latitude) ||
    isNaN(place.longitude)
  ) {
    return { isFeasible: false, rejectionReason: 'INVALID_COORDINATES' };
  }

  // 2. Missing name
  if (
    !place.name ||
    place.name.trim() === '' ||
    place.name.toLowerCase() === 'unnamed attraction' ||
    place.name.toLowerCase() === 'undefined'
  ) {
    return { isFeasible: false, rejectionReason: 'MISSING_NAME' };
  }

  // 3. Coordinate bounds check with safe corridor margin
  const { minLon, minLat, maxLon, maxLat } = corridor.boundingBox;
  if (
    place.latitude < minLat ||
    place.latitude > maxLat ||
    place.longitude < minLon ||
    place.longitude > maxLon
  ) {
    return { isFeasible: false, rejectionReason: 'OUTSIDE_PLANNING_CORRIDOR' };
  }

  return { isFeasible: true };
}
