/**
 * Deterministic Visit Duration Estimation Model.
 *
 * Provides category-grounded visit durations with transparent source attribution.
 * Never represents an estimate as verified fact.
 */

import { PlaceCategory, VisitDurationSource } from '@/domain';

/**
 * Configurable category defaults in minutes.
 */
export const CATEGORY_DEFAULT_DURATIONS_MINUTES: Record<PlaceCategory, number> = {
  museum: 90,
  historic: 75,
  restaurant: 60,
  cafe: 35,
  park: 45,
  shopping: 60,
  religious: 40,
  entertainment: 90,
  attraction: 60,
  other: 45,
};

/**
 * Fine-grained overrides for specific Geoapify category keys.
 */
export const SPECIFIC_CATEGORY_DURATIONS: Record<string, number> = {
  'tourism.sights.viewpoint': 30,
  'tourism.sights.memorial': 30,
  'tourism.sights.castle': 90,
  'tourism.sights.archaeological_site': 75,
  'entertainment.zoo': 120,
  'entertainment.theme_park': 150,
  'entertainment.culture.theatre': 120,
  'commercial.marketplace': 45,
  'commercial.shopping_mall': 75,
  'catering.fast_food': 30,
};

export interface DurationEstimationResult {
  durationMinutes: number;
  durationSource: VisitDurationSource;
  isProviderData: boolean;
}

/**
 * Estimates visit duration deterministically from category or provider details.
 */
export function estimateVisitDuration(
  category: PlaceCategory,
  categories: string[] = [],
  providerDurationMinutes?: number
): DurationEstimationResult {
  // 1. Highest priority: verified provider data if provided
  if (typeof providerDurationMinutes === 'number' && providerDurationMinutes > 0) {
    return {
      durationMinutes: Math.round(providerDurationMinutes),
      durationSource: 'provider',
      isProviderData: true,
    };
  }

  // 2. Specific category overrides
  for (const cat of categories) {
    const specific = SPECIFIC_CATEGORY_DURATIONS[cat];
    if (specific) {
      return {
        durationMinutes: specific,
        durationSource: 'category_default',
        isProviderData: false,
      };
    }
  }

  // 3. General domain category default
  const defaultMin = CATEGORY_DEFAULT_DURATIONS_MINUTES[category] || 60;
  return {
    durationMinutes: defaultMin,
    durationSource: 'category_default',
    isProviderData: false,
  };
}
