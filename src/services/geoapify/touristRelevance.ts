/**
 * Deterministic Tourist Relevance Framework & Classifier.
 *
 * Implements a strict hierarchical taxonomy driven by real Geoapify categories:
 * - Tier 1: PRIMARY_TOURIST (90-98) - major monuments, forts, castles, palaces, museums, archaeological sites, UNESCO heritage.
 * - Tier 2: SECONDARY_ATTRACTION (70-88) - scenic viewpoints, botanical gardens, nature reserves, zoos, theme parks, notable historic sights.
 * - Tier 3: LOCAL_ATTRACTION (40-65) - neighborhood green spaces, marketplaces, fountains, ordinary statues.
 * - Tier 4: SUPPORT_FOOD (25-35) - curated dining, cafes, bakeries.
 *
 * Enforces strict deprioritization of ordinary neighborhood places of worship and roadside statues
 * unless explicitly requested by user interest keywords (e.g. "religion", "spiritual").
 */

import { TouristPlaceType } from '@/domain';

export interface TouristRelevanceClassification {
  placeType: TouristPlaceType;
  touristRelevanceScore: number; // 0 - 100
  isReligious: boolean;
  isOrdinaryStatue: boolean;
  isGenericLocal: boolean;
  reason: string;
}

const RELIGIOUS_INTEREST_REGEX = /\b(relig|spirit|temple|church|mosque|masjid|worship|faith|shrine|pilgrim)\b/i;
const FOOD_INTEREST_REGEX = /\b(food|dining|lunch|dinner|restaurant|cafe|culinary|bakery)\b/i;

/**
 * Checks whether user provided explicit religious/spiritual interest.
 */
export function hasReligiousInterest(interests?: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  return interests.some((i) => RELIGIOUS_INTEREST_REGEX.test(i));
}

/**
 * Checks whether user provided explicit food/dining interest.
 */
export function hasFoodInterest(interests?: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  return interests.some((i) => FOOD_INTEREST_REGEX.test(i));
}

/**
 * Classifies a candidate place into a deterministic tourist relevance tier.
 */
export function classifyTouristRelevance(
  categories: string[] = [],
  name: string = '',
  userInterests?: string[]
): TouristRelevanceClassification {
  const catsLower = categories.map((c) => c.toLowerCase());
  const nameLower = (name || '').trim().toLowerCase();
  const catsJoined = catsLower.join(' ');

  const wantsReligion = hasReligiousInterest(userInterests);

  // 1. Detect religious place of worship
  const isReligiousCategory =
    catsLower.some(
      (c) =>
        c === 'building.place_of_worship' ||
        c.startsWith('religion') ||
        c.startsWith('building.place_of_worship') ||
        c === 'tourism.sights.place_of_worship'
    );

  const isReligiousName = /\b(temple|mandir|masjid|mosque|church|cathedral|dargah|prayer hall|gurudwara|ashram|shrine|samithi)\b/i.test(
    nameLower
  );

  const isReligious = isReligiousCategory || isReligiousName;

  // 2. Detect ordinary roadside statue
  const isStatueCategory =
    catsLower.some((c) => c.includes('statue') || c.includes('sculpture'));
  const isStatueName = /\b(statue|bust|vigraha)\b/i.test(nameLower);
  const isMonumentOrHeritage =
    catsLower.some(
      (c) =>
        c.includes('monument') ||
        c.includes('memorial') ||
        c.includes('castle') ||
        c.includes('fort') ||
        c.includes('heritage')
    ) || /\b(monument|memorial|national memorial)\b/i.test(nameLower);

  const isOrdinaryStatue = (isStatueCategory || isStatueName) && !isMonumentOrHeritage;

  // 3. Detect generic local / residential / commercial utility
  const isGenericLocal =
    /\b(society|office|hall|kalyana mandapam|function hall|community center|technical services|house|township|hostel|apartment|colony park|nagar park|playground)\b/i.test(
      nameLower
    ) || catsLower.some((c) => c.startsWith('amenity') || c.startsWith('office'));

  // 4. Religious place handling
  if (isReligious) {
    if (wantsReligion) {
      if (
        catsLower.some((c) => c.includes('historic') || c.includes('heritage')) ||
        isMonumentOrHeritage
      ) {
        return {
          placeType: 'PRIMARY_TOURIST',
          touristRelevanceScore: 92,
          isReligious: true,
          isOrdinaryStatue: false,
          isGenericLocal: false,
          reason: 'Prominent historic/heritage place of worship matching religious interest',
        };
      }
      return {
        placeType: 'SECONDARY_ATTRACTION',
        touristRelevanceScore: 78,
        isReligious: true,
        isOrdinaryStatue: false,
        isGenericLocal: false,
        reason: 'Place of worship matching user religious interest',
      };
    } else {
      if (
        catsLower.some((c) => c.includes('heritage.unesco') || c.includes('sights.castle') || c.includes('sights.fort'))
      ) {
        return {
          placeType: 'SECONDARY_ATTRACTION',
          touristRelevanceScore: 60,
          isReligious: true,
          isOrdinaryStatue: false,
          isGenericLocal: false,
          reason: 'UNESCO/Major historic place of worship (unrequested interest)',
        };
      }
      return {
        placeType: 'LOCAL_ATTRACTION',
        touristRelevanceScore: 18,
        isReligious: true,
        isOrdinaryStatue: false,
        isGenericLocal: false,
        reason: 'Ordinary neighborhood place of worship without religious interest',
      };
    }
  }

  // 5. Ordinary statue handling
  if (isOrdinaryStatue) {
    return {
      placeType: 'LOCAL_ATTRACTION',
      touristRelevanceScore: 35,
      isReligious: false,
      isOrdinaryStatue: true,
      isGenericLocal: false,
      reason: 'Ordinary roadside statue/bust without prominent monument designation',
    };
  }

  // 6. Generic local infrastructure handling
  if (isGenericLocal) {
    return {
      placeType: 'LOCAL_ATTRACTION',
      touristRelevanceScore: 20,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: true,
      reason: 'Everyday local neighborhood infrastructure / community hall',
    };
  }

  // 7. Food & Dining (Tier 4 Support)
  if (catsLower.some((c) => c.startsWith('catering.restaurant') || c.startsWith('catering.cafe') || c.startsWith('catering.fast_food'))) {
    return {
      placeType: 'SUPPORT_FOOD',
      touristRelevanceScore: 35,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      reason: 'Curated dining or cafe support stop',
    };
  }

  // 8. Tier 1: PRIMARY_TOURIST (Score: 90 - 98)
  const isPrimaryCategory =
    catsLower.some(
      (c) =>
        c === 'tourism.sights.castle' ||
        c === 'tourism.sights.fort' ||
        c === 'tourism.sights.palace' ||
        c === 'tourism.sights.archaeological_site' ||
        c === 'tourism.sights.ruins' ||
        c === 'tourism.sights.monument' ||
        c.startsWith('tourism.sights.memorial.monument') ||
        c.startsWith('entertainment.museum') ||
        c.startsWith('entertainment.culture.art_gallery') ||
        c === 'entertainment.culture.theatre' ||
        c.startsWith('heritage')
    );

  if (isPrimaryCategory) {
    let score = 95;
    if (catsJoined.includes('fort') || catsJoined.includes('castle') || catsJoined.includes('palace')) {
      score = 97;
    } else if (catsJoined.includes('museum') || catsJoined.includes('planetarium')) {
      score = 95;
    } else if (catsJoined.includes('archaeological_site') || catsJoined.includes('monument')) {
      score = 93;
    }
    return {
      placeType: 'PRIMARY_TOURIST',
      touristRelevanceScore: score,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      reason: 'Major city heritage monument, castle, fort, or museum',
    };
  }

  // 9. Tier 2: SECONDARY_ATTRACTION (Score: 70 - 88)
  const isSecondaryCategory =
    catsLower.some(
      (c) =>
        c === 'tourism.sights.viewpoint' ||
        c === 'leisure.park.garden' ||
        c === 'leisure.nature_reserve' ||
        c.startsWith('entertainment.zoo') ||
        c.startsWith('entertainment.aquarium') ||
        c.startsWith('entertainment.theme_park') ||
        c === 'building.historic' ||
        c === 'tourism.attraction'
    );

  if (isSecondaryCategory) {
    let score = 80;
    if (catsJoined.includes('zoo') || catsJoined.includes('theme_park') || catsJoined.includes('viewpoint')) {
      score = 85;
    } else if (catsJoined.includes('garden') || catsJoined.includes('nature_reserve')) {
      score = 82;
    }
    return {
      placeType: 'SECONDARY_ATTRACTION',
      touristRelevanceScore: score,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      reason: 'Prominent scenic, botanical, or entertainment attraction',
    };
  }

  // 10. General tourism sights
  if (catsLower.some((c) => c.startsWith('tourism.sights'))) {
    return {
      placeType: 'SECONDARY_ATTRACTION',
      touristRelevanceScore: 72,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      reason: 'Notable tourist sight',
    };
  }

  // 11. Tier 3: LOCAL_ATTRACTION (Score: 40 - 65)
  if (catsLower.some((c) => c.startsWith('leisure.park') || c.startsWith('commercial.marketplace') || c.includes('fountain'))) {
    return {
      placeType: 'LOCAL_ATTRACTION',
      touristRelevanceScore: 55,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      reason: 'Public park or marketplace',
    };
  }

  // Default fallback
  return {
    placeType: 'LOCAL_ATTRACTION',
    touristRelevanceScore: 45,
    isReligious: false,
    isOrdinaryStatue: false,
    isGenericLocal: false,
    reason: 'General local point of interest',
  };
}
