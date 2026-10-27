/**
 * Tourist Place Quality Gate.
 *
 * Sits deterministically between candidate discovery and the itinerary optimizer.
 * Enforces a strict 3-outcome decision model (ACCEPT, REVIEW, REJECT) to guarantee
 * that only genuine sightseeing destinations enter generated itineraries.
 *
 * Specific defect protections:
 * 1. Community halls / function halls / society facilities (e.g. Sanjaypuri Community Hall) -> REJECT.
 * 2. Corporate offices / software companies / tech parks (e.g. Ultimus) -> REJECT.
 * 3. Broad historic building tags (building.historic, heritage) -> REVIEW; excluded unless verified monument evidence exists.
 * 4. Generic places of worship -> REVIEW; excluded unless religious interest explicitly requested.
 * 5. Ordinary municipal / colony parks -> REVIEW; excluded unless botanical/nature reserve or nature interest requested.
 */

import type { PlaceCategory } from '@/domain';

const RELIGIOUS_INTEREST_REGEX = /\b(religion|religious|spiritual|spirit|temple|church|mosque|masjid|worship|faith|shrine|pilgrim)/i;
const FOOD_INTEREST_REGEX = /\b(food|dining|lunch|dinner|restaurant|cafe|culinary|bakery)/i;
const NATURE_INTEREST_REGEX = /\b(nature|natural|park|garden|outdoor|botanic|botanical|lake|scenic|wildlife|forest|reserve)/i;

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

export type QualityGateDecision = 'ACCEPT' | 'REVIEW' | 'REJECT';

export interface QualityGateCandidate {
  name: string;
  categories?: string[];
  category?: PlaceCategory;
  address?: string;
  website?: string;
}

export interface TouristQualityGateResult {
  decision: QualityGateDecision;
  isEligibleForSightseeing: boolean;
  isEligibleForDiningSupport: boolean;
  reason: string;
  matchedRule: string;
  categoryOverride?: PlaceCategory;
}

// ---------------------------------------------------------------------------
// Blocklists & Recognition Patterns
// ---------------------------------------------------------------------------

// Provider categories that unambiguously identify non-tourist infrastructure
const REJECT_CATEGORY_PATTERNS = [
  /^amenity\.community_centre/,
  /^amenity\.town_hall/,
  /^amenity\.public_facility/,
  /^amenity\.social_facility/,
  /^office/,
  /^building\.office/,
  /^commercial\.office/,
  /^commercial\.workplace/,
  /^commercial\.industrial/,
  /^building\.residential/,
  /^accommodation\.apartment/,
  /^residential/,
  /^building\.industrial/,
  /^industrial/,
  /^man_made\.works/,
  /^power/,
  /^utility/,
  /^amenity\.education/,
  /^building\.school/,
  /^building\.college/,
  /^building\.university/,
  /^amenity\.school/,
  /^amenity\.college/,
  /^amenity\.kindergarten/,
  /^amenity\.health/,
  /^amenity\.hospital/,
  /^amenity\.clinic/,
  /^amenity\.pharmacy/,
  /^building\.hospital/,
  /^amenity\.financial/,
  /^amenity\.bank/,
  /^amenity\.atm/,
  /^amenity\.police/,
  /^amenity\.fire_station/,
  /^amenity\.post_office/,
  /^amenity\.courthouse/,
  /^amenity\.prison/,
  /^commercial\.vehicle/,
  /^commercial\.gas_station/,
  /^commercial\.supermarket/,
  /^commercial\.convenience/,
  /^commercial\.kiosk/,
  /^service\./,
];

// Name regex: Community halls, function halls, marriage halls, societies
const COMMUNITY_HALL_REGEX =
  /\b(community\s*hall|community\s*centre|community\s*center|function\s*hall|kalyana\s*mandapam|kalyanamandapam|shadi\s*khana|marriage\s*hall|banquet\s*hall|party\s*hall|convention\s*centre|convention\s*center|meeting\s*hall|town\s*hall)\b/i;

const RESIDENTIAL_SOCIETY_REGEX =
  /\b(residential\s*society|housing\s*society|welfare\s*association|residents\s*association|colony\s*association|gated\s*community|apartments?|residency|enclave|layout|hostel|paying\s*guest|pg\s*for\s*(?:gents|ladies|men|women))\b/i;

// Name regex: Offices, IT companies, corporate buildings, software firms (including "Ultimus")
const CORPORATE_OFFICE_REGEX =
  /\b(ultimus|pvt\s*ltd|private\s*limited|ltd\b|llp\b|inc\b|technologies|technology|software|infotech|solutions|consultancy|consulting|corporate\s*office|head\s*office|headquarters|branch\s*office|substation|petrol\s*bunk|fuel\s*station|gas\s*station)\b/i;

// Name regex: Medical and healthcare
const MEDICAL_HEALTH_REGEX =
  /\b(hospital|clinic|nursing\s*home|dispensary|diagnostic\s*center|pathology\s*lab|blood\s*bank|maternity\s*hospital|dental\s*clinic|eye\s*hospital)\b/i;

// Name regex: Educational institutions
const EDUCATION_REGEX =
  /\b(high\s*school|grammar\s*school|primary\s*school|secondary\s*school|vidyalaya|junior\s*college|degree\s*college|polytechnic|coaching\s*center|tuition\s*center|academy\s*of\s*learning)\b/i;

// Name regex: Civic, administrative, police, banking
const CIVIC_ADMIN_REGEX =
  /\b(police\s*station|court\s*complex|sub-registrar|collectorate|mandal\s*office|ward\s*office|ghmc\s*office|municipality\s*office|post\s*office|bank\s*branch|bank\s*atm|e-seva|meeseva)\b/i;

// Verified Monument & Sight Keywords in Place Name
const VERIFIED_MONUMENT_NAME_REGEX =
  /\b(fort|palace|castle|tomb|tombs|darwaza|city\s*gate|minar|monument|memorial|haveli|ruins|archaeological|stepwell|baoli|clock\s*tower|planetarium|observatory)\b/i;

// Botanical / Floral / Nature garden keywords
const NOTABLE_GARDEN_REGEX =
  /\b(botanical|botanic|rose\s*garden|floral|national\s*park|deer\s*park|lake\s*view|sanctuary|reserve|biodiversity|safari)\b/i;

// Colony / Neighborhood park keywords
const LOCAL_NEIGHBORHOOD_REGEX =
  /\b(colony|nagar|layout|ward|sector|phase|circle|ghmc|bbmp|municipality|street|lane|enclave)\b/i;

// ---------------------------------------------------------------------------
// Evaluator Function
// ---------------------------------------------------------------------------

/**
 * Evaluates a candidate place through the Tourist Place Quality Gate.
 *
 * @param candidate Candidate place with name, categories, and optional address
 * @param userInterests Array of active user interests (e.g. ['history', 'food'])
 * @returns QualityGateResult with decision (ACCEPT, REVIEW, REJECT) and eligibility flags
 */
export function evaluateTouristQualityGate(
  candidate: QualityGateCandidate,
  userInterests?: string[]
): TouristQualityGateResult {
  const name = (candidate.name || '').trim();
  const nameLower = name.toLowerCase();
  const rawCats = candidate.categories || [];
  const catsLower = rawCats.map((c) => String(c).toLowerCase());
  const catsJoined = catsLower.join(' ');

  // =========================================================================
  // STEP 1: REJECT RULES (Hard filter - non-tourist infrastructure & offices)
  // =========================================================================

  // R1-A: Community / Function / Marriage halls
  if (COMMUNITY_HALL_REGEX.test(nameLower) || catsLower.some((c) => c === 'amenity.community_centre' || c === 'amenity.town_hall')) {
    return {
      decision: 'REJECT',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Rejected: Non-tourist community or function hall ("${name}")`,
      matchedRule: 'REJECT_COMMUNITY_HALL',
      categoryOverride: 'other',
    };
  }

  // R1-B: Corporate offices, software companies, tech parks (Defect fix: Ultimus & IT offices)
  if (
    CORPORATE_OFFICE_REGEX.test(nameLower) ||
    catsLower.some((c) => c.startsWith('office') || c.startsWith('building.office') || c.startsWith('commercial.office') || c === 'commercial.workplace')
  ) {
    return {
      decision: 'REJECT',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Rejected: Corporate office, commercial facility, or software company ("${name}")`,
      matchedRule: 'REJECT_CORPORATE_OFFICE',
      categoryOverride: 'other',
    };
  }

  // R1-C: Residential societies, apartments, hostels
  if (
    RESIDENTIAL_SOCIETY_REGEX.test(nameLower) ||
    catsLower.some((c) => c.startsWith('building.residential') || c.startsWith('accommodation.apartment') || c.startsWith('residential'))
  ) {
    return {
      decision: 'REJECT',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Rejected: Residential complex, society, or hostel ("${name}")`,
      matchedRule: 'REJECT_RESIDENTIAL',
      categoryOverride: 'other',
    };
  }

  // R1-D: Healthcare / Medical facilities
  if (
    MEDICAL_HEALTH_REGEX.test(nameLower) ||
    catsLower.some((c) => c.startsWith('amenity.health') || c.startsWith('amenity.hospital') || c.startsWith('building.hospital'))
  ) {
    return {
      decision: 'REJECT',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Rejected: Medical or healthcare facility ("${name}")`,
      matchedRule: 'REJECT_MEDICAL',
      categoryOverride: 'other',
    };
  }

  // R1-E: Educational institutions (unless explicitly a historic museum/monument)
  if (
    EDUCATION_REGEX.test(nameLower) ||
    catsLower.some((c) => c.startsWith('amenity.education') || c.startsWith('building.school') || c.startsWith('building.college'))
  ) {
    const isHistoricMonument = VERIFIED_MONUMENT_NAME_REGEX.test(nameLower) || catsLower.some((c) => c.startsWith('heritage.unesco'));
    if (!isHistoricMonument) {
      return {
        decision: 'REJECT',
        isEligibleForSightseeing: false,
        isEligibleForDiningSupport: false,
        reason: `Rejected: Educational facility or school ("${name}")`,
        matchedRule: 'REJECT_EDUCATION',
        categoryOverride: 'other',
      };
    }
  }

  // R1-F: Civic, administrative, police, banking facilities
  if (
    CIVIC_ADMIN_REGEX.test(nameLower) ||
    catsLower.some((c) =>
      c.startsWith('amenity.police') ||
      c.startsWith('amenity.fire_station') ||
      c.startsWith('amenity.post_office') ||
      c.startsWith('amenity.financial') ||
      c.startsWith('amenity.bank') ||
      c.startsWith('amenity.atm')
    )
  ) {
    return {
      decision: 'REJECT',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Rejected: Civic, administrative, or financial facility ("${name}")`,
      matchedRule: 'REJECT_CIVIC_ADMIN',
      categoryOverride: 'other',
    };
  }

  // R1-G: General non-tourist category regex blocklist
  const matchesRejectCategory = catsLower.some((c) =>
    REJECT_CATEGORY_PATTERNS.some((pattern) => pattern.test(c))
  );
  if (matchesRejectCategory) {
    return {
      decision: 'REJECT',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Rejected: Provider categories indicate non-tourist infrastructure ("${name}")`,
      matchedRule: 'REJECT_CATEGORY_BLOCKLIST',
      categoryOverride: 'other',
    };
  }

  // =========================================================================
  // STEP 2: ACCEPT RULES (Explicit high-confidence tourist taxonomy)
  // =========================================================================

  // A1: Major monuments, forts, palaces, castles, ruins, archaeological sites
  const isMajorHeritageSight = catsLower.some(
    (c) =>
      c === 'tourism.sights.fort' ||
      c === 'tourism.sights.castle' ||
      c === 'tourism.sights.palace' ||
      c === 'tourism.sights.ruins' ||
      c === 'tourism.sights.archaeological_site' ||
      c === 'tourism.sights.monument' ||
      c === 'tourism.sights.city_gate' ||
      c === 'tourism.sights.tower' ||
      c === 'tourism.sights.clock_tower' ||
      c === 'tourism.sights.tomb' ||
      c === 'tourism.sights.viewpoint' ||
      c === 'tourism.sights.memorial' ||
      c.startsWith('heritage.unesco')
  );

  if (isMajorHeritageSight) {
    return {
      decision: 'ACCEPT',
      isEligibleForSightseeing: true,
      isEligibleForDiningSupport: false,
      reason: `Accepted: Verified cultural or heritage monument ("${name}")`,
      matchedRule: 'ACCEPT_MAJOR_HERITAGE',
      categoryOverride: catsJoined.includes('museum') ? 'museum' : 'historic',
    };
  }

  // A2: Genuine Museums & Art Galleries & Planetariums
  // (Guard already executed: corporate names like Ultimus or software were rejected above!)
  const isGenuineMuseumOrArt = catsLower.some(
    (c) =>
      c.startsWith('entertainment.museum') ||
      c.startsWith('entertainment.culture.art_gallery') ||
      c === 'entertainment.culture.planetarium'
  );

  if (isGenuineMuseumOrArt) {
    return {
      decision: 'ACCEPT',
      isEligibleForSightseeing: true,
      isEligibleForDiningSupport: false,
      reason: `Accepted: Verified museum, art gallery, or cultural institution ("${name}")`,
      matchedRule: 'ACCEPT_MUSEUM_CULTURE',
      categoryOverride: 'museum',
    };
  }

  // A3: Notable Botanical Gardens & Nature Reserves
  const isBotanicalOrNatureReserve = catsLower.some(
    (c) => c === 'leisure.park.garden' || c === 'leisure.nature_reserve'
  );

  if (isBotanicalOrNatureReserve) {
    return {
      decision: 'ACCEPT',
      isEligibleForSightseeing: true,
      isEligibleForDiningSupport: false,
      reason: `Accepted: Verified botanical garden or nature reserve ("${name}")`,
      matchedRule: 'ACCEPT_BOTANICAL_NATURE',
      categoryOverride: 'park',
    };
  }

  // A4: Zoos, Aquariums, Theme Parks
  const isZooOrThemePark = catsLower.some(
    (c) =>
      c.startsWith('entertainment.zoo') ||
      c.startsWith('entertainment.aquarium') ||
      c.startsWith('entertainment.theme_park')
  );

  if (isZooOrThemePark) {
    return {
      decision: 'ACCEPT',
      isEligibleForSightseeing: true,
      isEligibleForDiningSupport: false,
      reason: `Accepted: Verified zoo, aquarium, or theme park ("${name}")`,
      matchedRule: 'ACCEPT_ZOO_THEME_PARK',
      categoryOverride: 'entertainment',
    };
  }

  // A5: Sights with explicit monument keyword in name
  const isTourismSight = catsLower.some((c) => c.startsWith('tourism.sights'));
  if (isTourismSight && VERIFIED_MONUMENT_NAME_REGEX.test(nameLower)) {
    return {
      decision: 'ACCEPT',
      isEligibleForSightseeing: true,
      isEligibleForDiningSupport: false,
      reason: `Accepted: Recognized tourist monument landmark ("${name}")`,
      matchedRule: 'ACCEPT_RECOGNIZED_MONUMENT_NAME',
      categoryOverride: 'historic',
    };
  }

  // =========================================================================
  // STEP 3: REVIEW RULES (Ambiguous / Broad Categories)
  // Excluded from automatic sightseeing itinerary unless verified supporting evidence exists.
  // =========================================================================

  // R3-A: Dining / Catering Support
  const isFoodVenue = catsLower.some(
    (c) =>
      c.startsWith('catering.restaurant') ||
      c.startsWith('catering.cafe') ||
      c.startsWith('catering.fast_food') ||
      c === 'catering'
  );

  if (isFoodVenue) {
    return {
      decision: 'REVIEW',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: true,
      reason: `Dining support stop: eligible for meals when food interest is requested, not a sightseeing stop ("${name}")`,
      matchedRule: 'REVIEW_FOOD_SUPPORT',
      categoryOverride: catsJoined.includes('cafe') ? 'cafe' : 'restaurant',
    };
  }

  // R3-B: Places of Worship (Temples, Mosques, Churches)
  const isWorshipPlace =
    catsLower.some(
      (c) =>
        c === 'building.place_of_worship' ||
        c.startsWith('religion') ||
        c === 'tourism.sights.place_of_worship'
    ) || /\b(temple|mandir|masjid|mosque|church|cathedral|dargah|gurudwara|shrine|ashram)\b/i.test(nameLower);

  if (isWorshipPlace) {
    const wantsReligion = hasReligiousInterest(userInterests);
    if (wantsReligion) {
      return {
        decision: 'REVIEW',
        isEligibleForSightseeing: true,
        isEligibleForDiningSupport: false,
        reason: `Promoted from REVIEW: Place of worship matches active user religious preference ("${name}")`,
        matchedRule: 'REVIEW_WORSHIP_REQUESTED',
        categoryOverride: 'religious',
      };
    }
    return {
      decision: 'REVIEW',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Excluded from automatic itinerary: Place of worship not requested in trip preferences ("${name}")`,
      matchedRule: 'REVIEW_WORSHIP_UNREQUESTED',
      categoryOverride: 'religious',
    };
  }

  // R3-C: Broad Historic Building / Heritage Tags (building.historic, heritage)
  const isBroadHistoric = catsLower.some((c) => c === 'building.historic' || c === 'heritage');
  if (isBroadHistoric) {
    // Check for supporting evidence in name (e.g. Fort, Palace, Tomb, Darwaza, Minar, Monument)
    if (VERIFIED_MONUMENT_NAME_REGEX.test(nameLower)) {
      return {
        decision: 'REVIEW',
        isEligibleForSightseeing: true,
        isEligibleForDiningSupport: false,
        reason: `Promoted from REVIEW: Historic building with verified monument landmark title ("${name}")`,
        matchedRule: 'REVIEW_HISTORIC_PROMOTED',
        categoryOverride: 'historic',
      };
    }
    return {
      decision: 'REVIEW',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Excluded from automatic itinerary: Broad historic building tag without confirmed monument evidence ("${name}")`,
      matchedRule: 'REVIEW_HISTORIC_EXCLUDED',
      categoryOverride: 'historic',
    };
  }

  // R3-D: Leisure Parks
  const isPark = catsLower.some((c) => c.startsWith('leisure.park'));
  if (isPark) {
    const isNotableGarden = NOTABLE_GARDEN_REGEX.test(nameLower);
    const wantsNature = hasNatureInterest(userInterests);
    const isLocalColony = LOCAL_NEIGHBORHOOD_REGEX.test(nameLower);

    if (isNotableGarden || (wantsNature && !isLocalColony)) {
      return {
        decision: 'REVIEW',
        isEligibleForSightseeing: true,
        isEligibleForDiningSupport: false,
        reason: `Promoted from REVIEW: Botanical/nature park landmark matching outdoor interest ("${name}")`,
        matchedRule: 'REVIEW_PARK_PROMOTED',
        categoryOverride: 'park',
      };
    }
    return {
      decision: 'REVIEW',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Excluded from automatic itinerary: Ordinary municipal or neighborhood park ("${name}")`,
      matchedRule: 'REVIEW_PARK_EXCLUDED',
      categoryOverride: 'park',
    };
  }

  // R3-E: Broad Tourism Attraction (tourism.attraction)
  const isBroadAttraction = catsLower.some((c) => c === 'tourism.attraction' || c === 'tourism');
  if (isBroadAttraction) {
    const hasAttractionKeyword = /\b(lake|dam|viewpoint|falls|waterfall|promenade|scenic|cultural\s*centre|planetarium)\b/i.test(nameLower);
    if (hasAttractionKeyword) {
      return {
        decision: 'REVIEW',
        isEligibleForSightseeing: true,
        isEligibleForDiningSupport: false,
        reason: `Promoted from REVIEW: Scenic/cultural landmark matching attraction profile ("${name}")`,
        matchedRule: 'REVIEW_ATTRACTION_PROMOTED',
        categoryOverride: 'attraction',
      };
    }
    return {
      decision: 'REVIEW',
      isEligibleForSightseeing: false,
      isEligibleForDiningSupport: false,
      reason: `Excluded from automatic itinerary: Generic attraction tag without verified tourist evidence ("${name}")`,
      matchedRule: 'REVIEW_ATTRACTION_EXCLUDED',
      categoryOverride: 'attraction',
    };
  }

  // =========================================================================
  // STEP 4: DEFAULT REJECT (Any venue not recognized as tourist sight)
  // =========================================================================
  return {
    decision: 'REJECT',
    isEligibleForSightseeing: false,
    isEligibleForDiningSupport: false,
    reason: `Rejected: Unclassified or non-sightseeing venue ("${name}")`,
    matchedRule: 'REJECT_DEFAULT',
    categoryOverride: 'other',
  };
}
