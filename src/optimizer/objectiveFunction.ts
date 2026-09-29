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
  startTimeMinutes?: number;
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
    requiredBufferMinutes,
    visitedPlaces,
    unknownCostCount,
    unverifiedHoursCount,
  } = context;

  // 1. Activity Utility: Rewards quality visit time with smooth diminishing returns (0 - 180 points)
  // Prevents artificial early saturation while avoiding endless stop expansion.
  const visitMinutesTier1 = Math.min(180, totalVisitMinutes);
  const visitMinutesTier2 = Math.min(180, Math.max(0, totalVisitMinutes - 180));
  const visitMinutesTier3 = Math.max(0, totalVisitMinutes - 360);

  const visitDurationScore =
    visitMinutesTier1 * 0.25 + // 0 - 3h: 0.25 pt/min (up to 45 pts)
    visitMinutesTier2 * 0.18 + // 3 - 6h: 0.18 pt/min (up to 32.4 pts)
    visitMinutesTier3 * 0.10;  // 6h+:    0.10 pt/min

  // Stop count bonus with diminishing returns per stop
  const stopBonusTable = [0, 18, 34, 48, 60, 70, 78, 86, 94, 102];
  const stopCountBonus =
    visitedPlaces.length < stopBonusTable.length
      ? stopBonusTable[visitedPlaces.length]
      : 70 + (visitedPlaces.length - 5) * 8;

  const activityUtility = Math.round(
    Math.min(180, visitDurationScore + stopCountBonus)
  );

  // Tourist relevance & category composition analysis
  let touristRelevanceSum = 0;
  let religiousStopCount = 0;
  let ordinaryStatueCount = 0;
  let foodStopCount = 0;
  let genericParkCount = 0;

  const wantsReligion = userInterests.some((i) =>
    /\b(relig|spirit|temple|church|mosque|masjid|worship|faith|shrine)\b/i.test(i)
  );
  const wantsFood = userInterests.some((i) =>
    /\b(food|dining|lunch|dinner|restaurant|cafe|culinary)\b/i.test(i)
  );
  const wantsNature = userInterests.some((i) =>
    /\b(nature|park|garden|outdoor|lake|botanic|wildlife)\b/i.test(i)
  );

  for (const place of visitedPlaces) {
    const rel = place.touristRelevanceScore ?? 75;
    // Major tourist cultural landmarks (Tier 1: 88-98) earn substantial utility
    if (rel >= 85) {
      touristRelevanceSum += 25;
    } else if (rel >= 65) {
      touristRelevanceSum += 16;
    } else {
      touristRelevanceSum += Math.round((rel / 100) * 8);
    }

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
    const isGenericPark =
      (place.category === 'park' || (place.categories || []).some((c) => c.startsWith('leisure.park'))) &&
      !(place.categories || []).some((c) => c === 'leisure.park.garden' || c === 'leisure.nature_reserve') &&
      !/\b(botanical|garden|national park|sanctuary|lake view|biodiversity)\b/i.test(place.name || '');
    if (isGenericPark) {
      genericParkCount++;
    }
  }

  // 2. Interest Match Utility: Rewards places matching user interests (0 - 140 points)
  let interestUtility = 0;
  if (userInterests.length === 0) {
    // Balanced default trip: driven by genuine tourist attraction relevance
    interestUtility = Math.min(140, touristRelevanceSum);
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
    interestUtility = Math.min(140, interestUtility);
  }

  // 3. Quality & Popularity Utility (0 - 60 points)
  let qualityUtility = 0;
  for (const place of visitedPlaces) {
    if (typeof place.touristRelevanceScore === 'number' && place.touristRelevanceScore >= 85) {
      qualityUtility += 18;
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

  // 5. Schedule Utilization Objective: Rewards productive daytime use conditional on candidate quality (0 - 25 points)
  const startTimeMinutes =
    context.startTimeMinutes ??
    Math.max(0, context.plannedEndMinutes - totalTravelMinutes - totalVisitMinutes);
  const availablePlanningWindow = Math.max(1, context.deadlineMinutes - startTimeMinutes);
  const usableWindow = Math.max(1, availablePlanningWindow - requiredBufferMinutes);
  const usedPlanningTime = Math.max(0, context.plannedEndMinutes - startTimeMinutes);
  const utilizationRatio = Math.min(1.0, Math.max(0, usedPlanningTime / usableWindow));

  // Conditional on candidate quality:
  let totalRelevance = 0;
  for (const p of visitedPlaces) {
    totalRelevance += p.touristRelevanceScore ?? 70;
  }
  const avgRelevance = visitedPlaces.length > 0 ? totalRelevance / visitedPlaces.length : 0;

  // Quality multiplier: authentic sightseeing (avg >= 75) receives full credit (1.0).
  // Low quality (avg < 45) drops multiplier towards 0 so filler cannot boost utilization.
  const qualityMultiplier = Math.min(1.0, Math.max(0, (avgRelevance - 45) / 35));
  const scheduleUtilizationUtility = Math.round(25 * utilizationRatio * qualityMultiplier);

  // 6. Travel Time Penalty: Penalizes vehicle/transit time
  // Travel overhead takes away from sightseeing enjoyment
  const travelTimePenalty = Math.round(totalTravelMinutes * 0.35);

  // 7. Detour Penalty: Penalizes wandering far off the start -> end path
  const excessMeters = Math.max(0, totalDistanceMeters - directDistanceMeters);
  const excessKm = excessMeters / 1000;
  const detourPenalty = Math.round(Math.min(40, excessKm * 1.5));

  // 8. Schedule Risk Penalty: Penalizes cutting too close to the required safety reserve boundary
  let riskPenalty = 0;
  const unreservedSlack = context.deadlineMinutes - (context.plannedEndMinutes + requiredBufferMinutes);
  if (unreservedSlack < 5) {
    riskPenalty = 15; // Very tight margin beyond buffer
  } else if (unreservedSlack < 10) {
    riskPenalty = 5;
  } else {
    riskPenalty = 0;
  }

  // 9. Uncertainty Penalty: Modest discount for unknown ticket costs or unverified hours
  const uncertaintyPenalty = Math.min(30, unknownCostCount * 4 + unverifiedHoursCount * 3);

  // 10. Tourist Quality Penalty (penalizes unwanted neighborhood worship, statues, excess dining, excess generic parks)
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
  if (!wantsNature && genericParkCount > 1) {
    // Ordinary municipal neighborhood parks downweighted when general city tour requested
    touristQualityPenalty += 30 * (genericParkCount - 1);
  }

  // Composite Score
  const rawScore =
    activityUtility +
    interestUtility +
    qualityUtility +
    diversityUtility +
    scheduleUtilizationUtility -
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
    scheduleUtilizationUtility,
    travelTimePenalty,
    detourPenalty,
    riskPenalty,
    uncertaintyPenalty,
    finalScore,
  };

  return { finalScore, breakdown };
}
