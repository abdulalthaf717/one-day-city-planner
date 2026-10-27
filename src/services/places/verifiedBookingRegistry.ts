/**
 * Curated Registry of Verified Official Websites and Direct Ticket-Booking Pages.
 *
 * Requirements:
 * - Distinguish general informational websites from verified direct official booking pages.
 * - Require authoritative provenance (e.g., government tourism portal, ASI, official trust).
 * - Associate links with stable place identifiers, OSM IDs, or verified coordinates.
 * - Prevent identity collision: similar names must not inherit links without matching criteria.
 * - Zero LLM hallucination: Only verified entries with explicit verification dates and sources.
 */

import { sanitizeExternalUrl } from '../../utils/urlSecurity';

export type BookingVerificationStatus = 'verified' | 'unverified' | 'unavailable';
export type LinkSourceType = 'provider' | 'curated' | 'official';

export interface VerifiedAttractionLinkEntry {
  attractionId: string; // Canonical identifier
  canonicalName: string;
  aliases: string[];
  knownPlaceIds?: string[];
  osmIds?: Array<{ id: number | string; type?: string }>;
  approxCoordinates?: { lat: number; lng: number; toleranceMeters?: number };
  officialWebsiteUrl?: string;
  websiteSource?: LinkSourceType;
  officialBookingUrl?: string; // DIRECT ticket booking page ONLY
  bookingVerificationStatus: BookingVerificationStatus;
  bookingVerificationSource?: string;
  bookingVerificationDate?: string; // ISO date string (YYYY-MM-DD)
  notes?: string;
}

export interface AttractionLinkLookupParams {
  placeId?: string;
  osmId?: number | string;
  osmType?: string;
  name: string;
  coordinates?: { lat: number; lng: number };
}

/**
 * Curated registry of verified attractions.
 * Notice:
 * - Case A (Verified Booking Page): Nehru Zoological Park, Lumbini Park Boating
 * - Case B (Official Website Only, Tickets at Counter): Salar Jung Museum, Birla Science Museum, Chowmahalla Palace, The Nizam's Museum, Golconda Fort, Charminar
 * - Case C (No Website or Booking): Telangana State Archaeology Museum, Spanish Mosque
 */
export const VERIFIED_ATTRACTION_REGISTRY: VerifiedAttractionLinkEntry[] = [
  {
    attractionId: 'nehru-zoological-park-hyderabad',
    canonicalName: 'Nehru Zoological Park',
    aliases: [
      'hyderabad zoo',
      'nehru zoo',
      'nehru zoological park, hyderabad',
      'nehru zoological garden',
      'zoo park hyderabad',
    ],
    knownPlaceIds: [
      '512140bb69bf9e534059cb2dfba0055c3140f00101f9011746860000000000c002019203154e65687275205a6f6f6c6f676963616c205061726b',
    ],
    osmIds: [{ id: 8847847, type: 'w' }, { id: 24707198, type: 'r' }],
    approxCoordinates: { lat: 17.3508, lng: 78.4516, toleranceMeters: 2500 },
    officialWebsiteUrl: 'https://nzptsfd.telangana.gov.in/home.do',
    websiteSource: 'official',
    officialBookingUrl: 'https://nzptsfd.telangana.gov.in/',
    bookingVerificationStatus: 'verified',
    bookingVerificationSource: 'Telangana State Forest Department Official Portal (nzptsfd.telangana.gov.in)',
    bookingVerificationDate: '2026-10-27',
    notes: 'Direct online e-ticketing gateway operated by the Government of Telangana Forest Department.',
  },
  {
    attractionId: 'lumbini-park-boating-hyderabad',
    canonicalName: 'Lumbini Park',
    aliases: [
      'lumbini park boating',
      'hussain sagar boating',
      'lumbini laser show',
      'lumbini park',
    ],
    knownPlaceIds: [],
    approxCoordinates: { lat: 17.4101, lng: 78.4735, toleranceMeters: 2000 },
    officialWebsiteUrl: 'https://tourism.telangana.gov.in/',
    websiteSource: 'official',
    officialBookingUrl: 'https://tgtdc.in',
    bookingVerificationStatus: 'verified',
    bookingVerificationSource: 'Telangana Tourism Development Corporation (TGTDC) Official E-Booking Portal',
    bookingVerificationDate: '2026-10-27',
    notes: 'Online booking for Hussain Sagar boating and Buddha Statue boat trips via TGTDC.',
  },
  {
    attractionId: 'salar-jung-museum-hyderabad',
    canonicalName: 'Salar Jung Museum',
    aliases: ['salarjung museum', 'salar jung', 'salarjung'],
    knownPlaceIds: [
      '51a9519f8cbf9e534059cc10a915125f3140f00102f9013aed330e0000000092031153616c6172204a756e67204d757365756d',
    ],
    osmIds: [{ id: 238284090, type: 'w' }],
    approxCoordinates: { lat: 17.3713, lng: 78.4804, toleranceMeters: 2000 },
    officialWebsiteUrl: 'https://salarjungmuseum.in/',
    websiteSource: 'official',
    officialBookingUrl: undefined, // In-person gate tickets or external partner only
    bookingVerificationStatus: 'unavailable',
    bookingVerificationSource: 'Salar Jung Museum Board (salarjungmuseum.in) - Counter admission',
    bookingVerificationDate: '2026-10-27',
    notes: 'Official informational website available; no standalone direct online booking engine.',
  },
  {
    attractionId: 'bm-birla-science-museum-hyderabad',
    canonicalName: 'Birla Science Museum',
    aliases: [
      'b.m. birla science centre',
      'bm birla science museum',
      'birla science centre',
      'birla planetarium',
      'b. m. birla science museum',
      'birla planetarium hyderabad',
    ],
    knownPlaceIds: [],
    approxCoordinates: { lat: 17.4042, lng: 78.4716, toleranceMeters: 2000 },
    officialWebsiteUrl: 'https://gpbaasri.org/',
    websiteSource: 'official',
    officialBookingUrl: undefined, // In-person ticket counter only
    bookingVerificationStatus: 'unavailable',
    bookingVerificationSource: 'GP Birla Archaeological Astronomical and Scientific Research Institute (gpbaasri.org)',
    bookingVerificationDate: '2026-10-27',
    notes: 'Institutional portal exists; entry tickets purchased directly at the gate counter.',
  },
  {
    attractionId: 'chowmahalla-palace-hyderabad',
    canonicalName: 'Chowmahalla Palace',
    aliases: ['chowmahallat', 'chowmahalla'],
    knownPlaceIds: [],
    approxCoordinates: { lat: 17.3578, lng: 78.4717, toleranceMeters: 2000 },
    officialWebsiteUrl: 'https://www.chowmahalla.in/',
    websiteSource: 'official',
    officialBookingUrl: undefined,
    bookingVerificationStatus: 'unavailable',
    bookingVerificationSource: 'Chowmahalla Palace Trust (chowmahalla.in) - Physical ticket counter',
    bookingVerificationDate: '2026-10-27',
    notes: 'Official palace guidelines website; individual entry tickets sold at counter only.',
  },
  {
    attractionId: 'nizams-museum-hyderabad',
    canonicalName: "The Nizam's Museum",
    aliases: ["nizam's museum", 'nizam museum', 'purani haveli museum'],
    knownPlaceIds: [
      '5109e9dfe4ed9e534059dd990986735d3140f00103f90162b15d2500000000920312546865204e697a616d2773204d757365756d',
    ],
    osmIds: [{ id: 626897250, type: 'n' }],
    approxCoordinates: { lat: 17.3664, lng: 78.4828, toleranceMeters: 2000 },
    officialWebsiteUrl: 'https://www.hehnmh.com/',
    websiteSource: 'official',
    officialBookingUrl: undefined,
    bookingVerificationStatus: 'unavailable',
    bookingVerificationSource: "H.E.H. The Nizam's Museum Trust (hehnmh.com)",
    bookingVerificationDate: '2026-10-27',
    notes: 'Informational site; tickets sold on-site at Purani Haveli entrance.',
  },
  {
    attractionId: 'golconda-fort-hyderabad',
    canonicalName: 'Golconda Fort',
    aliases: ['golkonda fort', 'golconda', 'golkonda'],
    knownPlaceIds: [
      '511f3d8f9bab99534059cae1934e24623140f00101f901d14b8b0000000000c0020192030d476f6c636f6e646120466f7274',
    ],
    approxCoordinates: { lat: 17.3833, lng: 78.4011, toleranceMeters: 3000 },
    officialWebsiteUrl: 'https://asi.nic.in/',
    websiteSource: 'official',
    officialBookingUrl: undefined,
    bookingVerificationStatus: 'unavailable',
    bookingVerificationSource: 'Archaeological Survey of India (asi.nic.in)',
    bookingVerificationDate: '2026-10-27',
    notes: 'Central ASI monuments portal; dedicated monument booking URL not maintained on standalone domain.',
  },
  {
    attractionId: 'charminar-hyderabad',
    canonicalName: 'Charminar',
    aliases: ['char minar'],
    knownPlaceIds: [
      '5181334289609e534059b52792f9915c3140f00102f901836e320e00000000c00201920309436861726d696e6172',
    ],
    approxCoordinates: { lat: 17.3616, lng: 78.4747, toleranceMeters: 2000 },
    officialWebsiteUrl: 'https://asi.nic.in/',
    websiteSource: 'official',
    officialBookingUrl: undefined,
    bookingVerificationStatus: 'unavailable',
    bookingVerificationSource: 'Archaeological Survey of India (asi.nic.in)',
    bookingVerificationDate: '2026-10-27',
    notes: 'National ASI monument.',
  },
  {
    attractionId: 'telangana-state-archaeology-museum',
    canonicalName: 'Telangana State Archaeology Museum',
    aliases: [
      'state archaeology museum',
      'hyderabad museum',
      'public gardens museum',
      'ap state archaeology museum',
    ],
    knownPlaceIds: [],
    approxCoordinates: { lat: 17.3995, lng: 78.4697, toleranceMeters: 2000 },
    officialWebsiteUrl: undefined, // Case C: No website or booking
    websiteSource: undefined,
    officialBookingUrl: undefined,
    bookingVerificationStatus: 'unavailable',
    bookingVerificationSource: 'Department of Heritage Telangana - Physical counter tickets only',
    bookingVerificationDate: '2026-10-27',
    notes: 'No dedicated official website or online booking gateway.',
  },
];

function normalizeMatchText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Searches the verified attraction registry using stable identifiers,
 * normalized names, and geographic distance verification.
 *
 * Guaranteed protection:
 * - A different attraction with a similar name will NOT match if coordinates or
 *   distinguishing tokens conflict (Section 10 Test H).
 */
export function lookupVerifiedAttractionLinks(
  params: AttractionLinkLookupParams
): VerifiedAttractionLinkEntry | null {
  const { placeId, osmId, name, coordinates } = params;

  // 1. Direct place_id match (Highest priority)
  if (placeId) {
    const directMatch = VERIFIED_ATTRACTION_REGISTRY.find(
      (entry) =>
        entry.knownPlaceIds?.includes(placeId) ||
        entry.attractionId === placeId
    );
    if (directMatch) return directMatch;
  }

  // 2. Direct OSM ID match
  if (osmId !== undefined && osmId !== null) {
    const osmIdStr = String(osmId);
    const osmMatch = VERIFIED_ATTRACTION_REGISTRY.find((entry) =>
      entry.osmIds?.some((o) => String(o.id) === osmIdStr)
    );
    if (osmMatch) return osmMatch;
  }

  // 3. Name & Alias match with Geographic Distance Guard
  const normSearchName = normalizeMatchText(name);
  if (!normSearchName) return null;

  for (const entry of VERIFIED_ATTRACTION_REGISTRY) {
    const normEntryName = normalizeMatchText(entry.canonicalName);
    const isExactName = normSearchName === normEntryName;
    const isAliasMatch = entry.aliases.some(
      (alias) => normalizeMatchText(alias) === normSearchName
    );

    // Fuzzy token overlap check:
    // Ensure that distinct places like "Nehru Zoological Park" vs "Nehru Centenary Tribal Museum"
    // or "Nehru Park" do not accidentally match!
    const entryTokens = normEntryName.split(' ');
    const searchTokens = normSearchName.split(' ');

    const isCloseNameMatch =
      isExactName ||
      isAliasMatch ||
      (entryTokens.every((t) => searchTokens.includes(t)) &&
        Math.abs(entryTokens.length - searchTokens.length) <= 1);

    if (isCloseNameMatch) {
      // If coordinates are provided and the registry has reference coordinates,
      // verify distance falls within tolerance to prevent similar-named sites in
      // different cities or neighborhoods from inheriting links (Test H)
      if (coordinates && entry.approxCoordinates) {
        const distMeters = calculateDistanceMeters(
          coordinates.lat,
          coordinates.lng,
          entry.approxCoordinates.lat,
          entry.approxCoordinates.lng
        );
        const maxTol = entry.approxCoordinates.toleranceMeters || 2500;
        if (distMeters > maxTol) {
          // Reject match due to spatial mismatch
          continue;
        }
      }

      return entry;
    }
  }

  return null;
}

/**
 * Resolves safe, validated action links for a candidate or attraction.
 */
export function resolveAttractionActionLinks(params: {
  placeId?: string;
  osmId?: number | string;
  osmType?: string;
  name: string;
  coordinates?: { lat: number; lng: number };
  providerWebsite?: string;
}): {
  websiteUrl?: string;
  websiteSource?: LinkSourceType;
  officialBookingUrl?: string;
  bookingVerificationStatus: BookingVerificationStatus;
  bookingVerificationSource?: string;
  bookingVerificationDate?: string;
  bookingLabel?: string;
  websiteLabel?: string;
  directionsUrl: string;
} {
  const { coordinates, name, providerWebsite } = params;

  // Directions URL
  const directionsUrl = coordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

  // Registry lookup
  const verifiedEntry = lookupVerifiedAttractionLinks(params);

  // Safe provider website sanitization
  const safeProviderWeb = sanitizeExternalUrl(providerWebsite);

  if (verifiedEntry) {
    const safeOfficialWeb = sanitizeExternalUrl(verifiedEntry.officialWebsiteUrl);
    const safeBookingUrl = sanitizeExternalUrl(verifiedEntry.officialBookingUrl);

    const finalWebsiteUrl = safeOfficialWeb || safeProviderWeb;
    const finalWebsiteSource: LinkSourceType | undefined = safeOfficialWeb
      ? 'official'
      : (safeProviderWeb ? 'provider' : undefined);

    const isBookingVerified =
      Boolean(safeBookingUrl) && verifiedEntry.bookingVerificationStatus === 'verified';

    return {
      websiteUrl: finalWebsiteUrl,
      websiteSource: finalWebsiteSource,
      officialBookingUrl: isBookingVerified ? safeBookingUrl : undefined,
      bookingVerificationStatus: isBookingVerified
        ? 'verified'
        : verifiedEntry.bookingVerificationStatus,
      bookingVerificationSource: verifiedEntry.bookingVerificationSource,
      bookingVerificationDate: verifiedEntry.bookingVerificationDate,
      bookingLabel: isBookingVerified ? 'Book Official Tickets' : undefined,
      websiteLabel: finalWebsiteUrl ? 'Website' : undefined,
      directionsUrl,
    };
  }

  // Not in curated registry: fall back safely to provider-sourced website only
  return {
    websiteUrl: safeProviderWeb,
    websiteSource: safeProviderWeb ? 'provider' : undefined,
    officialBookingUrl: undefined,
    bookingVerificationStatus: 'unavailable',
    websiteLabel: safeProviderWeb ? 'Website' : undefined,
    directionsUrl,
  };
}
