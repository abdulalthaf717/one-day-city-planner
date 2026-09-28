/**
 * Geoapify Category Mapping & Strategy Configuration.
 *
 * Maps user-friendly interest names (e.g. "history", "food", "nature") to valid Geoapify Places v2 API category keys.
 * Enforces balanced category defaults when user interests are omitted.
 */

import { PlaceCategory } from '@/domain';

/**
 * Valid Geoapify v2 Categories mapped by standard user interest tags.
 */
export const INTEREST_TO_GEOAPIFY_CATEGORIES: Record<string, string[]> = {
  history: [
    'tourism.sights.fort,tourism.sights.castle',
    'tourism.sights.archaeological_site',
    'entertainment.museum',
    'heritage',
    'building.historic',
  ],
  culture: [
    'entertainment.museum',
    'entertainment.culture',
    'tourism.sights.fort,tourism.sights.castle',
    'tourism.attraction',
    'heritage',
  ],
  museum: [
    'entertainment.museum',
  ],
  food: [
    'catering.restaurant',
    'catering.cafe',
  ],
  dining: [
    'catering.restaurant',
  ],
  cafe: [
    'catering.cafe',
  ],
  nature: [
    'leisure.park',
  ],
  park: [
    'leisure.park',
  ],
  shopping: [
    'commercial.shopping_mall',
    'commercial.marketplace',
  ],
  architecture: [
    'tourism.sights.fort,tourism.sights.castle',
    'tourism.sights.archaeological_site',
    'building.historic',
  ],
  photography: [
    'tourism.sights.viewpoint',
    'tourism.attraction',
    'tourism.sights',
  ],
  religious: [
    'building.place_of_worship',
    'religion.place_of_worship',
    'tourism.sights.place_of_worship',
  ],
  spiritual: [
    'building.place_of_worship',
    'religion.place_of_worship',
    'tourism.sights.place_of_worship',
  ],
  entertainment: [
    'entertainment.theme_park',
    'entertainment.zoo',
    'entertainment.aquarium',
    'entertainment.culture.theatre',
  ],
  family: [
    'entertainment.zoo',
    'entertainment.theme_park',
    'entertainment.museum',
    'leisure.park',
    'tourism.attraction',
  ],
};

/**
 * Default balanced categories when user provides NO interests.
 * Staged to guarantee high-yield tourist sights (forts, palaces, museums, archaeological sites,
 * botanical gardens, viewpoints) + curated support dining.
 */
export const DEFAULT_BALANCED_CATEGORIES: string[] = [
  'tourism.sights.fort,tourism.sights.castle',
  'entertainment.museum',
  'tourism.sights.archaeological_site',
  'tourism.attraction',
  'leisure.park',
  'entertainment.theme_park,entertainment.zoo',
  'catering.restaurant',
  'catering.cafe',
];

/**
 * Resolves user interest list into a deduplicated list of Geoapify Places API categories.
 *
 * @param interests Array of user interest strings (e.g. ["history", "food"] or ["history + food"])
 * @returns Object with mapped category slices and metadata
 */
export function resolveTargetCategories(interests?: string[]): {
  categorySlices: string[];
  isDefaultStrategy: boolean;
  matchedInterests: string[];
} {
  if (!interests || interests.length === 0) {
    return {
      categorySlices: [...DEFAULT_BALANCED_CATEGORIES],
      isDefaultStrategy: true,
      matchedInterests: [],
    };
  }

  // Parse compound interest strings (e.g. "history + food", "culture, nature")
  const parsedInterests = interests
    .flatMap((item) => item.split(/[+,/&]/))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (parsedInterests.length === 0) {
    return {
      categorySlices: [...DEFAULT_BALANCED_CATEGORIES],
      isDefaultStrategy: true,
      matchedInterests: [],
    };
  }

  const categorySet = new Set<string>();
  const matchedInterests: string[] = [];

  for (const interest of parsedInterests) {
    let found = false;
    for (const [key, mapped] of Object.entries(INTEREST_TO_GEOAPIFY_CATEGORIES)) {
      if (interest.includes(key) || key.includes(interest)) {
        mapped.forEach((cat) => categorySet.add(cat));
        matchedInterests.push(key);
        found = true;
      }
    }

    if (!found) {
      // Fallback: check if the input itself looks like a valid Geoapify category prefix
      if (
        interest.startsWith('tourism') ||
        interest.startsWith('catering') ||
        interest.startsWith('entertainment') ||
        interest.startsWith('leisure') ||
        interest.startsWith('commercial')
      ) {
        categorySet.add(interest);
        matchedInterests.push(interest);
      }
    }
  }

  // If no mapped categories could be extracted, fall back gracefully to balanced defaults
  if (categorySet.size === 0) {
    return {
      categorySlices: [...DEFAULT_BALANCED_CATEGORIES],
      isDefaultStrategy: true,
      matchedInterests: [],
    };
  }

  return {
    categorySlices: Array.from(categorySet),
    isDefaultStrategy: false,
    matchedInterests: Array.from(new Set(matchedInterests)),
  };
}

/**
 * Maps raw Geoapify category array to domain PlaceCategory enum.
 */
export function mapRawCategoriesToPlaceCategory(categories: string[] = []): PlaceCategory {
  const joined = categories.join(' ').toLowerCase();

  if (joined.includes('museum')) return 'museum';
  if (joined.includes('historic') || joined.includes('heritage') || joined.includes('archaeological')) {
    return 'historic';
  }
  if (joined.includes('restaurant') || joined.includes('catering.fast_food')) return 'restaurant';
  if (joined.includes('cafe')) return 'cafe';
  if (joined.includes('park') || joined.includes('nature_reserve') || joined.includes('garden')) {
    return 'park';
  }
  if (joined.includes('shopping') || joined.includes('marketplace') || joined.includes('mall')) {
    return 'shopping';
  }
  if (joined.includes('religion') || joined.includes('place_of_worship') || joined.includes('temple') || joined.includes('church') || joined.includes('mosque')) {
    return 'religious';
  }
  if (joined.includes('entertainment') || joined.includes('theatre') || joined.includes('zoo') || joined.includes('theme_park')) {
    return 'entertainment';
  }
  if (joined.includes('sights') || joined.includes('attraction') || joined.includes('viewpoint')) {
    return 'attraction';
  }

  return 'attraction';
}
