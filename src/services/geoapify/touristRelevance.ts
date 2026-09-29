/**
 * Deterministic Tourist Relevance Framework & Classifier (Iteration 1).
 *
 * Implements a strict, city-agnostic hierarchical taxonomy driven by real Geoapify categories:
 * - Tier 1: PRIMARY_TOURIST (88-98)
 *   Major monuments, forts, castles, palaces, museums, archaeological sites, UNESCO heritage,
 *   prominent viewpoints, historical towers, and city gates.
 * - Tier 2: SECONDARY_ATTRACTION (65-84)
 *   Notable botanical/formal gardens, nature reserves, recognized zoos, aquariums, theme parks,
 *   historic buildings, established cultural sights, prominent religious heritage (when requested).
 * - Tier 3: LOCAL_ATTRACTION (30-55)
 *   Generic municipal neighborhood parks, ordinary statues/busts, marketplaces, fountains,
 *   ordinary neighborhood places of worship (without religious interest).
 * - Tier 4: SUPPORT_FOOD / UTILITY (10-35)
 *   Curated restaurants, cafes, generic shopping centers, transit/support infrastructure.
 */

import { TouristPlaceType } from '@/domain';

export interface TouristRelevanceClassification {
  placeType: TouristPlaceType;
  touristRelevanceScore: number; // 0 - 100
  isReligious: boolean;
  isOrdinaryStatue: boolean;
  isGenericLocal: boolean;
  isGenericPark: boolean;
  reason: string;
}

const RELIGIOUS_INTEREST_REGEX = /\b(relig|spirit|temple|church|mosque|masjid|worship|faith|shrine|pilgrim)\b/i;
const FOOD_INTEREST_REGEX = /\b(food|dining|lunch|dinner|restaurant|cafe|culinary|bakery)\b/i;
const NATURE_INTEREST_REGEX = /\b(nature|park|garden|outdoor|botanic|lake|scenic|wildlife|forest|reserve)\b/i;
const HISTORY_INTEREST_REGEX = /\b(history|historic|heritage|monument|ancient|archaeol|fort|palace|museum)\b/i;
const ARCHITECTURE_INTEREST_REGEX = /\b(architect|building|design|structure|monument)\b/i;

export function hasReligiousInterest(interests?: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  return interests.some((i) => RELIGIOUS_INTEREST_REGEX.test(i));
}

export function hasFoodInterest(interests?: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  return interests.some((i) => FOOD_INTEREST_REGEX.test(i));
}

export function hasNatureInterest(interests?: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  return interests.some((i) => NATURE_INTEREST_REGEX.test(i));
}

export function hasHistoryInterest(interests?: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  return interests.some((i) => HISTORY_INTEREST_REGEX.test(i));
}

export function hasArchitectureInterest(interests?: string[]): boolean {
  if (!interests || interests.length === 0) return false;
  return interests.some((i) => ARCHITECTURE_INTEREST_REGEX.test(i));
}

/**
 * Classifies a candidate place into a deterministic tourist relevance tier.
 * Accepts categories array, single category string, or CandidatePlace object.
 */
export function classifyTouristRelevance(
  categoriesOrPlace: string[] | { categories?: string[]; name?: string; category?: string } | string = [],
  name: string = '',
  userInterests?: string[]
): TouristRelevanceClassification {
  let catArray: string[] = [];
  let placeName = name;

  if (Array.isArray(categoriesOrPlace)) {
    catArray = categoriesOrPlace;
  } else if (categoriesOrPlace && typeof categoriesOrPlace === 'object') {
    catArray = Array.isArray(categoriesOrPlace.categories) ? categoriesOrPlace.categories : [];
    if (!placeName && categoriesOrPlace.name) placeName = categoriesOrPlace.name;
    if (categoriesOrPlace.category && !catArray.includes(categoriesOrPlace.category)) {
      catArray.push(categoriesOrPlace.category);
    }
  } else if (typeof categoriesOrPlace === 'string') {
    catArray = [categoriesOrPlace];
  }

  const catsLower = catArray.map((c) => String(c).toLowerCase());
  const nameLower = (placeName || '').trim().toLowerCase();
  const catsJoined = catsLower.join(' ');

  const wantsReligion = hasReligiousInterest(userInterests);
  const wantsFood = hasFoodInterest(userInterests);
  const wantsNature = hasNatureInterest(userInterests);
  const wantsHistory = hasHistoryInterest(userInterests);
  const wantsArchitecture = hasArchitectureInterest(userInterests);

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

  // 2. Detect ordinary roadside statue/bust
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
    ) || /\b(monument|memorial|national memorial|war memorial)\b/i.test(nameLower);

  const isOrdinaryStatue = (isStatueCategory || isStatueName) && !isMonumentOrHeritage;

  // 3. Detect generic local / residential / commercial infrastructure
  const isGenericLocal =
    /\b(society|office|hall|kalyana mandapam|function hall|community center|technical services|house|township|hostel|apartment|layout|colony|ward|circle|bank|atm|clinic|hospital)\b/i.test(
      nameLower
    ) || catsLower.some((c) => c.startsWith('amenity') || c.startsWith('office'));

  // 4. Detect generic municipal neighborhood park vs notable botanical/floral/nature garden
  const isGardenOrNatureReserve =
    catsLower.some(
      (c) =>
        c === 'leisure.park.garden' ||
        c === 'leisure.nature_reserve' ||
        c.includes('botanical') ||
        c.includes('reserve')
    ) ||
    /\b(botanical|botanic|garden|gardens|floral|rose garden|deer park|lake view|national park|sanctuary|reserve|biodiversity|safari)\b/i.test(
      nameLower
    );

  const isGenericPark =
    catsLower.some((c) => c.startsWith('leisure.park')) &&
    !isGardenOrNatureReserve &&
    (/\b(park|ground|playground)\b/i.test(nameLower) ||
      /\b(colony|nagar|layout|ward|sector|phase|circle|ghmc|bbmp|municipality)\b/i.test(nameLower));

  // ---------------------------------------------------------------------------
  // Tier 1: Major Tourist / Cultural Attraction (Score: 88 - 98)
  // ---------------------------------------------------------------------------
  const isTier1HeritageSights =
    catsLower.some(
      (c) =>
        c === 'tourism.sights.castle' ||
        c === 'tourism.sights.fort' ||
        c === 'tourism.sights.palace' ||
        c === 'tourism.sights.archaeological_site' ||
        c === 'tourism.sights.ruins' ||
        c === 'tourism.sights.monument' ||
        c === 'tourism.sights.city_gate' ||
        c === 'tourism.sights.tower' ||
        c === 'tourism.sights.tomb' ||
        c.startsWith('tourism.sights.memorial.monument') ||
        c.startsWith('heritage.unesco') ||
        c === 'heritage'
    );

  const isTier1MuseumCulture =
    catsLower.some(
      (c) =>
        c.startsWith('entertainment.museum') ||
        c.startsWith('entertainment.culture.art_gallery') ||
        c === 'entertainment.culture.planetarium'
    );

  const isMajorViewpoint = catsLower.some((c) => c === 'tourism.sights.viewpoint');

  if (isTier1HeritageSights || isTier1MuseumCulture || isMajorViewpoint) {
    let score = 94;
    if (catsJoined.includes('fort') || catsJoined.includes('castle') || catsJoined.includes('palace') || catsJoined.includes('unesco')) {
      score = 98;
    } else if (catsJoined.includes('museum') || catsJoined.includes('art_gallery')) {
      score = 95;
    } else if (catsJoined.includes('archaeological_site') || catsJoined.includes('monument')) {
      score = 93;
    } else if (isMajorViewpoint) {
      score = 90;
    }

    if (wantsHistory || wantsArchitecture) score = Math.min(100, score + 2);

    return {
      placeType: 'PRIMARY_TOURIST',
      touristRelevanceScore: score,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      isGenericPark: false,
      reason: 'Major cultural/heritage landmark, fort, palace, museum, or recognized viewpoint',
    };
  }

  // ---------------------------------------------------------------------------
  // Religious places
  // ---------------------------------------------------------------------------
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
          isGenericPark: false,
          reason: 'Prominent historic/heritage place of worship matching religious interest',
        };
      }
      return {
        placeType: 'SECONDARY_ATTRACTION',
        touristRelevanceScore: 78,
        isReligious: true,
        isOrdinaryStatue: false,
        isGenericLocal: false,
        isGenericPark: false,
        reason: 'Place of worship matching user religious interest',
      };
    } else {
      // Religious interest NOT requested
      if (
        catsLower.some((c) => c.includes('heritage.unesco') || c.includes('sights.castle') || c.includes('sights.fort'))
      ) {
        return {
          placeType: 'SECONDARY_ATTRACTION',
          touristRelevanceScore: 60,
          isReligious: true,
          isOrdinaryStatue: false,
          isGenericLocal: false,
          isGenericPark: false,
          reason: 'UNESCO/Major historic place of worship (unrequested interest)',
        };
      }
      // Ordinary neighborhood temple/mosque/church: strictly downweighted
      return {
        placeType: 'LOCAL_ATTRACTION',
        touristRelevanceScore: 18,
        isReligious: true,
        isOrdinaryStatue: false,
        isGenericLocal: false,
        isGenericPark: false,
        reason: 'Ordinary neighborhood place of worship without religious interest',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Ordinary statues
  // ---------------------------------------------------------------------------
  if (isOrdinaryStatue) {
    return {
      placeType: 'LOCAL_ATTRACTION',
      touristRelevanceScore: 32,
      isReligious: false,
      isOrdinaryStatue: true,
      isGenericLocal: false,
      isGenericPark: false,
      reason: 'Ordinary roadside statue/bust without prominent monument designation',
    };
  }

  // ---------------------------------------------------------------------------
  // Generic local infrastructure / offices
  // ---------------------------------------------------------------------------
  if (isGenericLocal) {
    return {
      placeType: 'LOCAL_ATTRACTION',
      touristRelevanceScore: 15,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: true,
      isGenericPark: false,
      reason: 'Everyday local neighborhood infrastructure / community hall',
    };
  }

  // ---------------------------------------------------------------------------
  // Food & Dining (Tier 4 Support / Utility)
  // ---------------------------------------------------------------------------
  if (
    catsLower.some(
      (c) =>
        c.startsWith('catering.restaurant') ||
        c.startsWith('catering.cafe') ||
        c.startsWith('catering.fast_food') ||
        c === 'catering'
    )
  ) {
    if (wantsFood) {
      return {
        placeType: 'SECONDARY_ATTRACTION',
        touristRelevanceScore: 82,
        isReligious: false,
        isOrdinaryStatue: false,
        isGenericLocal: false,
        isGenericPark: false,
        reason: 'Curated dining or cafe destination matching food interest',
      };
    }
    return {
      placeType: 'SUPPORT_FOOD',
      touristRelevanceScore: 28,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      isGenericPark: false,
      reason: 'Curated dining or cafe support stop',
    };
  }

  // ---------------------------------------------------------------------------
  // Tier 2: Recognized Secondary Attraction (Score: 65 - 84)
  // ---------------------------------------------------------------------------
  if (isGardenOrNatureReserve) {
    const score = wantsNature ? 88 : 78;
    return {
      placeType: 'SECONDARY_ATTRACTION',
      touristRelevanceScore: score,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      isGenericPark: false,
      reason: 'Notable botanical/formal garden or nature reserve',
    };
  }

  const isTier2Entertainment =
    catsLower.some(
      (c) =>
        c.startsWith('entertainment.zoo') ||
        c.startsWith('entertainment.aquarium') ||
        c.startsWith('entertainment.theme_park') ||
        c === 'building.historic' ||
        c.startsWith('entertainment.culture.theatre') ||
        c === 'tourism.attraction'
    );

  if (isTier2Entertainment) {
    let score = 76;
    if (catsJoined.includes('zoo') || catsJoined.includes('aquarium') || catsJoined.includes('theme_park')) {
      score = 84;
    } else if (catsJoined.includes('historic')) {
      score = 80;
    }
    return {
      placeType: 'SECONDARY_ATTRACTION',
      touristRelevanceScore: score,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      isGenericPark: false,
      reason: 'Recognized secondary attraction, zoo, theme park, or historic building',
    };
  }

  // General tourism sights (fallback under tourism.sights)
  if (catsLower.some((c) => c.startsWith('tourism.sights'))) {
    return {
      placeType: 'SECONDARY_ATTRACTION',
      touristRelevanceScore: 68,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      isGenericPark: false,
      reason: 'Notable tourist sight',
    };
  }

  // ---------------------------------------------------------------------------
  // Tier 3: Local Attraction (Score: 30 - 55)
  // ---------------------------------------------------------------------------
  if (isGenericPark) {
    // If nature interest was explicitly requested, bump slightly; otherwise local park (38)
    const score = wantsNature ? 62 : 38;
    return {
      placeType: wantsNature ? 'SECONDARY_ATTRACTION' : 'LOCAL_ATTRACTION',
      touristRelevanceScore: score,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      isGenericPark: true,
      reason: wantsNature ? 'Neighborhood park matching nature interest' : 'Generic neighborhood municipal park',
    };
  }

  if (catsLower.some((c) => c.startsWith('commercial.marketplace') || c.includes('fountain') || c.startsWith('leisure.park'))) {
    return {
      placeType: 'LOCAL_ATTRACTION',
      touristRelevanceScore: 45,
      isReligious: false,
      isOrdinaryStatue: false,
      isGenericLocal: false,
      isGenericPark: false,
      reason: 'Public marketplace, fountain, or local recreation area',
    };
  }

  // Default fallback
  return {
    placeType: 'LOCAL_ATTRACTION',
    touristRelevanceScore: 35,
    isReligious: false,
    isOrdinaryStatue: false,
    isGenericLocal: false,
    isGenericPark: false,
    reason: 'General local point of interest',
  };
}
