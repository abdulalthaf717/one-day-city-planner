/**
 * Multi-Factor Transparent Objective Scoring Function.
 *
 * Evaluates candidate itinerary sequences considering:
 * - Activity value & dwell time
 * - Alignment with user preferences
 * - Category diversity
 * - Directional travel efficiency & excess detour
 * - Schedule risk & deadline margin
 * - Uncertainty discount
 */

import { CandidatePlace, OptimizerScoreBreakdown } from '@/domain';

export interface ObjectiveContext {
  userInterests: string[];
  totalTravelMinutes: number;
  totalVisitMinutes: number;
  totalDistanceMeters: number;
  directDistanceMeters: number;
  safetyBufferMinutes: number;
  requiredBufferMinutes: number;
  deadlineMinutes: number;
  plannedEndMinutes: number;
  visitedPlaces: CandidatePlace[];
  unknownCostCount: number;
  unverifiedHoursCount: number;
}

export function computeObjectiveScore(context: ObjectiveContext): {
  finalScore: number;
  breakdown: OptimizerScoreBreakdown;
} {
  const {
    userInterests = [],
    totalTravelMinutes,
    totalVisitMinutes,
    totalDistanceMeters,
    directDistanceMeters,
    safetyBufferMinutes,
    requiredBufferMinutes,
    visitedPlaces,
    unknownCostCount,
    unverifiedHoursCount,
  } = context;

  // 1. Activity Utility: Rewards quality visit time (0 - 120 points)
  // Each visit minute contributes, plus a base bonus per visit stop
  const activityUtility = Math.round(
    Math.min(120, totalVisitMinutes * 0.25 + visitedPlaces.length * 15)
  );

  // Tourist relevance & category composition analysis
  let touristRelevanceSum = 0;
  let religiousStopCount = 0;
  let ordinaryStatueCount = 0;
  let foodStopCount = 0;

  const wantsReligion = userInterests.some((i) =>
    /\b(relig|spirit|temple|church|mosque|masjid|worship|faith|shrine)\b/i.test(i)
  );
  const wantsFood = userInterests.some((i) =>
    /\b(food|dining|lunch|dinner|restaurant|cafe|culinary)\b/i.test(i)
  );

  for (const place of visitedPlaces) {
    const rel = place.touristRelevanceScore ?? 75;
    touristRelevanceSum += Math.round((rel / 100) * 15);

    if (place.placeType === 'SUPPORT_FOOD' || place.category === 'restaurant' || place.category === 'cafe') {
      foodStopCount++;
    }
    if (
      place.category === 'religious' ||
      (place.categories || []).some((c) => c.includes('place_of_worship'))
    ) {
      religiousStopCount++;
    }
    if (
      (place.categories || []).some((c) => c.includes('statue')) &&
      !(place.categories || []).some(
        (c) =>
          c.includes('monument') ||
          c.includes('memorial') ||
          c.includes('castle') ||
          c.includes('fort') ||
          c.includes('heritage')
      )
    ) {
      ordinaryStatueCount++;
    }
  }

  // 2. Interest Match Utility: Rewards places matching user interests (0 - 80 points)
  let interestUtility = 0;
  if (userInterests.length === 0) {
    // Balanced default trip: driven by genuine tourist attraction relevance
    interestUtility = Math.min(60, touristRelevanceSum);
  } else {
    const interestSet = new Set(userInterests.map((i) => i.toLowerCase().trim()));
    for (const place of visitedPlaces) {
      const match = place.categories.some((c) =>
        Array.from(interestSet).some((interest) => c.toLowerCase().includes(interest))
      ) || interestSet.has(place.category.toLowerCase());
      if (match) {
        interestUtility += 20;
      }
    }
    interestUtility = Math.min(80, interestUtility);
  }

  // 3. Quality & Popularity Utility (0 - 60 points)
  let qualityUtility = 0;
  for (const place of visitedPlaces) {
    if (typeof place.touristRelevanceScore === 'number' && place.touristRelevanceScore >= 85) {
      qualityUtility += 15;
    } else if (typeof place.qualityScore === 'number') {
      qualityUtility += place.qualityScore * 0.15;
    } else {
      qualityUtility += 8;
    }
  }
  qualityUtility = Math.round(Math.min(60, qualityUtility));

  // 4. Category Diversity Utility (0 - 50 points)
  // Rewards itineraries that do not visit 5 restaurants in a row
  const uniqueCategories = new Set(visitedPlaces.map((p) => p.category));
  const diversityUtility = Math.min(50, uniqueCategories.size * 12);

  // 5. Travel Time Penalty: Penalizes vehicle/transit time
  // Travel overhead takes away from sightseeing enjoyment
  const travelTimePenalty = Math.round(totalTravelMinutes * 0.35);

  // 6. Detour Penalty: Penalizes wandering far off the start -> end path
  const excessMeters = Math.max(0, totalDistanceMeters - directDistanceMeters);
  const excessKm = excessMeters / 1000;
  const detourPenalty = Math.round(Math.min(40, excessKm * 1.5));

  // 7. Schedule Risk Penalty: Penalizes buffer margins close to minimum
  let riskPenalty = 0;
  const bufferMargin = safetyBufferMinutes - requiredBufferMinutes;
  if (bufferMargin < 5) {
    riskPenalty = 20; // Very tight buffer
  } else if (bufferMargin < 15) {
    riskPenalty = 10;
  } else {
    riskPenalty = 0;
  }

  // 8. Uncertainty Penalty: Modest discount for unknown ticket costs or unverified hours
  const uncertaintyPenalty = Math.min(30, unknownCostCount * 4 + unverifiedHoursCount * 3);

  // 9. Tourist Quality Penalty (penalizes unwanted neighborhood worship, statues, excess dining)
  let touristQualityPenalty = 0;
  if (!wantsReligion && religiousStopCount > 0) {
    // Ordinary neighborhood worship places heavily penalized if unrequested
    touristQualityPenalty += 20 + 35 * (religiousStopCount - 1);
  }
  if (ordinaryStatueCount > 0) {
    touristQualityPenalty += 25 * ordinaryStatueCount;
  }
  if (!wantsFood && foodStopCount > 1) {
    touristQualityPenalty += 30 * (foodStopCount - 1);
  }

  // Composite Score
  const rawScore =
    activityUtility +
    interestUtility +
    qualityUtility +
    diversityUtility -
    travelTimePenalty -
    detourPenalty -
    riskPenalty -
    uncertaintyPenalty -
    touristQualityPenalty;

  const finalScore = Math.max(1, Math.round(rawScore));

  const breakdown: OptimizerScoreBreakdown = {
    activityUtility,
    interestUtility,
    qualityUtility,
    diversityUtility,
    travelTimePenalty,
    detourPenalty,
    riskPenalty,
    uncertaintyPenalty,
    finalScore,
  };

  return { finalScore, breakdown };
}
