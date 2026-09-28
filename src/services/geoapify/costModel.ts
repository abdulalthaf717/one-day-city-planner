/**
 * Deterministic Cost & Spending Model.
 *
 * Distinguishes known fees, estimated dining spends, free public amenities, and unknown admission costs.
 * Never invents ticket prices. Incorporates people count into group cost calculations.
 */

import { CostSourceType, PlaceCategory, PlaceCostInfo } from '@/domain';

export interface CostEvaluationResult {
  cost: PlaceCostInfo;
  costSource: CostSourceType;
  isAffordableForBudget: boolean;
}

/**
 * Typical estimated dining spend per person in INR.
 * Clearly marked as 'estimated', never represented as a verified bill.
 */
export const ESTIMATED_DINING_SPEND_INR: Record<string, number> = {
  restaurant: 450,
  cafe: 200,
  fast_food: 180,
  bar: 700,
};

/**
 * Categories that are inherently free public amenities unless explicitly ticketed.
 */
export const INHERENTLY_FREE_CATEGORIES: PlaceCategory[] = [
  'park',
  'religious',
];

/**
 * Evaluates place cost given category, raw categories, people count, and total budget.
 */
export function evaluatePlaceCost(params: {
  category: PlaceCategory;
  categories?: string[];
  peopleCount: number;
  perPersonBudget?: number;
  totalBudget?: number;
  currency?: string;
  providerFee?: { perPerson?: number; fixed?: number; isFree?: boolean };
}): CostEvaluationResult {
  const {
    category,
    categories = [],
    peopleCount = 1,
    perPersonBudget,
    totalBudget,
    currency = 'INR',
    providerFee,
  } = params;

  // 1. If provider explicitly marked place as free
  if (providerFee?.isFree) {
    return {
      cost: {
        amountPerPerson: 0,
        fixedEntryCost: 0,
        totalForGroup: 0,
        currency,
        isFree: true,
      },
      costSource: 'free',
      isAffordableForBudget: true,
    };
  }

  // 2. If provider provided verified ticket fee
  if (typeof providerFee?.perPerson === 'number' || typeof providerFee?.fixed === 'number') {
    const perPerson = providerFee.perPerson || 0;
    const fixed = providerFee.fixed || 0;
    const total = perPerson * peopleCount + fixed;

    const affordable =
      totalBudget !== undefined
        ? total <= totalBudget
        : perPersonBudget !== undefined
        ? perPerson <= perPersonBudget
        : true;

    return {
      cost: {
        amountPerPerson: perPerson > 0 ? perPerson : undefined,
        fixedEntryCost: fixed > 0 ? fixed : undefined,
        totalForGroup: total,
        currency,
        isFree: total === 0,
      },
      costSource: 'known',
      isAffordableForBudget: affordable,
    };
  }

  // 3. Inherently free public amenities (parks, temples, public gardens)
  if (INHERENTLY_FREE_CATEGORIES.includes(category)) {
    return {
      cost: {
        amountPerPerson: 0,
        fixedEntryCost: 0,
        totalForGroup: 0,
        currency,
        isFree: true,
      },
      costSource: 'free',
      isAffordableForBudget: true,
    };
  }

  // 4. Dining / Food places (Estimated meal spend)
  if (category === 'restaurant' || category === 'cafe') {
    const isCafe = category === 'cafe' || categories.includes('catering.cafe');
    const isFastFood = categories.includes('catering.fast_food');
    const spendPerPerson = isFastFood
      ? ESTIMATED_DINING_SPEND_INR.fast_food
      : isCafe
      ? ESTIMATED_DINING_SPEND_INR.cafe
      : ESTIMATED_DINING_SPEND_INR.restaurant;

    const groupSpend = spendPerPerson * peopleCount;
    const affordable =
      totalBudget !== undefined
        ? groupSpend <= totalBudget
        : perPersonBudget !== undefined
        ? spendPerPerson <= perPersonBudget
        : true;

    return {
      cost: {
        estimatedFoodSpend: spendPerPerson,
        amountPerPerson: spendPerPerson,
        totalForGroup: groupSpend,
        currency,
        isFree: false,
      },
      costSource: 'estimated',
      isAffordableForBudget: affordable,
    };
  }

  // 5. Unknown ticket fee (museums, monuments, entertainment where fee is not published in OSM/Geoapify)
  // We do NOT invent a fee. We record costSource: 'unknown'.
  return {
    cost: {
      currency,
      isFree: false,
    },
    costSource: 'unknown',
    // Unknown does not mean free, nor does it immediately block if budget is sufficient
    isAffordableForBudget: true,
  };
}
