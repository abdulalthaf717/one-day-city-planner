/**
 * Geoapify Places Discovery, Filtering & Normalization Service.
 *
 * Implements:
 * - Real-world candidate discovery via GET /v2/places
 * - Geographic corridor bounding box and proximity bias
 * - Deduplication (primary: place_id, fallback: normalized name + Haversine <= 100m)
 * - Transparent duration and cost models
 * - Deterministic scoring & category-balanced pool selection
 * - Strict zero-fabrication guarantees (no fake tickets, hours, or booking links)
 * - Free-tier quota preservation with PlacesCache
 */

import {
  CandidatePlace,
  Coordinates,
  LocationPoint,
  PlaceCategory,
  TravelMode,
  VerificationStatus,
} from '@/domain';
import { PlacesCache } from './cache';
import {
  mapRawCategoriesToPlaceCategory,
  resolveTargetCategories,
} from './categoryMapping';
import {
  buildPlanningCorridor,
  calculateHaversineDistance,
  PlanningCorridor,
} from './geographicCorridor';
import { estimateVisitDuration } from './durationModel';
import { evaluatePlaceCost } from './costModel';
import {
  isCandidateFeasible,
  scoreCandidate,
  ScoringContext,
} from './candidateScoring';
import { GeoapifyClient } from './client';
import { GeoapifyPlacesResponse } from './types';
import {
  classifyTouristRelevance,
  hasFoodInterest,
  hasNatureInterest,
  hasReligiousInterest,
} from './touristRelevance';

export interface CandidateDiscoveryRequest {
  city: string;
  start: { coordinates: Coordinates; name?: string };
  end: { coordinates: Coordinates; name?: string };
  interests?: string[];
  availableTripMinutes?: number;
  startTime?: string;
  latestArrivalTime?: string;
  budget?: {
    total?: number;
    perPerson?: number;
    currency?: string;
  };
  travelMode?: TravelMode;
  peopleCount?: number;
  poolTargetSize?: number;
  bypassCache?: boolean;
}

export interface CandidateDiscoveryResult {
  success: boolean;
  candidates: CandidatePlace[];
  metadata: {
    city: string;
    categoriesUsed: string[];
    isDefaultStrategy: boolean;
    matchedInterests: string[];
    rawCandidateCount: number;
    deduplicatedCount: number;
    filteredCandidateCount: number;
    finalCandidateCount: number;
    corridor: PlanningCorridor;
    fromCache: boolean;
    warnings: string[];
  };
}

export interface IGeoapifyPlacesService {
  discoverCandidates(request: CandidateDiscoveryRequest): Promise<CandidateDiscoveryResult>;
  geocodeAddress(text: string, biasCity?: string): Promise<LocationPoint | null>;
  searchPlaceMatches(text: string, biasCity?: string, limit?: number): Promise<LocationPoint[]>;
  createVerifiedCandidate(
    location: LocationPoint,
    categoryHint?: string,
    city?: string
  ): CandidatePlace;
  searchPlaces(
    city: string,
    center: Coordinates,
    categories?: string[],
    limit?: number
  ): Promise<CandidatePlace[]>;
  getPlaceDetails(placeId: string): Promise<Partial<CandidatePlace> | null>;
}

export class GeoapifyPlacesService extends GeoapifyClient implements IGeoapifyPlacesService {
  private cache = PlacesCache.getInstance();

  /**
   * Discovers, filters, scores, and normalizes candidate places for a trip.
   */
  async discoverCandidates(
    request: CandidateDiscoveryRequest
  ): Promise<CandidateDiscoveryResult> {
    const {
      city,
      start,
      end,
      interests = [],
      budget,
      peopleCount = 1,
      poolTargetSize = 16,
      bypassCache = false,
    } = request;

    // Calculate available trip minutes if provided as HH:mm
    let availableMinutes = request.availableTripMinutes;
    if (!availableMinutes && request.startTime && request.latestArrivalTime) {
      const [sH, sM] = request.startTime.split(':').map(Number);
      const [eH, eM] = request.latestArrivalTime.split(':').map(Number);
      if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
        availableMinutes = (eH * 60 + eM) - (sH * 60 + sM);
        if (availableMinutes <= 0) availableMinutes += 24 * 60; // Next-day wrap
      }
    }

    // 1. Resolve target categories from user interests
    const { categorySlices, isDefaultStrategy, matchedInterests } =
      resolveTargetCategories(interests);

    // 2. Build geographic planning corridor with dynamic margin for day trips
    const isDayDrive = request.travelMode === 'drive' || (!request.travelMode && (availableMinutes ?? 0) >= 300);
    const corridorMarginKm = isDayDrive ? 8.0 : 4.0;
    const corridor = buildPlanningCorridor(start.coordinates, end.coordinates, corridorMarginKm, 12.0);

    // 3. Cache lookup
    const cacheKey = this.cache.makePlacesKey({
      city,
      startLat: start.coordinates.lat,
      startLng: start.coordinates.lng,
      endLat: end.coordinates.lat,
      endLng: end.coordinates.lng,
      categories: categorySlices,
      availableMinutes,
      budget: budget?.total,
    });

    if (!bypassCache) {
      const cached = this.cache.get<CandidateDiscoveryResult>(cacheKey);
      if (cached) {
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            fromCache: true,
          },
        };
      }
    }

    const apiKey = this.ensureApiKey();
    const warnings: string[] = [];

    // 4. Concurrently query category slices with small limits to preserve free quota
    // Limit per category: 6 to 8 items
    const perCategoryLimit = 8;
    const rawFeatures: GeoapifyPlacesResponse['features'] = [];

    const fetchPromises = categorySlices.map(async (categoryKey) => {
      const url = new URL(`${this.baseUrl}/v2/places`);
      url.searchParams.set('categories', categoryKey);
      url.searchParams.set('filter', corridor.filterString);
      url.searchParams.set('bias', corridor.biasString);
      url.searchParams.set('limit', perCategoryLimit.toString());
      url.searchParams.set('apiKey', apiKey);

      try {
        const data = await this.fetchJson<GeoapifyPlacesResponse>(url.toString());
        return data.features || [];
      } catch (err) {
        warnings.push(
          `Failed to fetch category "${categoryKey}": ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const batch of results) {
      rawFeatures.push(...batch);
    }

    const rawCandidateCount = rawFeatures.length;

    // 5. Deduplication
    // Primary: place_id
    // Fallback: normalized name + coordinates <= 100 meters
    const deduplicatedFeatures = this.deduplicateFeatures(rawFeatures);
    const deduplicatedCount = deduplicatedFeatures.length;

    // 6. Normalization into CandidatePlace objects
    const rawCandidates: CandidatePlace[] = deduplicatedFeatures.map((feat) => {
      const p = feat.properties;
      const category: PlaceCategory = mapRawCategoriesToPlaceCategory(p.categories);
      const isVerified = Boolean(p.name && p.place_id);

      // Duration model
      const durationResult = estimateVisitDuration(category, p.categories);

      // Cost model
      const costResult = evaluatePlaceCost({
        category,
        categories: p.categories,
        peopleCount,
        perPersonBudget: budget?.perPerson,
        totalBudget: budget?.total,
        currency: budget?.currency || 'INR',
      });

      // Tourist relevance classification
      const touristClassification = classifyTouristRelevance(
        p.categories || [],
        p.name || '',
        interests
      );

      // Opening hours
      const rawHours = p.opening_hours;
      const openingHoursSource = rawHours ? 'provider' : 'unavailable';

      const latitude = p.lat ?? feat.geometry?.coordinates?.[1];
      const longitude = p.lon ?? feat.geometry?.coordinates?.[0];

      return {
        id: p.place_id || `loc_${latitude.toFixed(4)}_${longitude.toFixed(4)}`,
        name: p.name || 'Unnamed Attraction',
        category,
        categories: p.categories || [],
        latitude,
        longitude,
        coordinates: { lat: latitude, lng: longitude },
        address: p.formatted || p.address_line1,
        city: p.city || city,
        country: p.country || 'India',
        openingHours: rawHours,
        openingHoursSource,
        estimatedVisitDurationMinutes: durationResult.durationMinutes,
        visitDurationSource: durationResult.durationSource,
        cost: costResult.cost,
        costSource: costResult.costSource,
        rating: undefined, // Geoapify free places v2 does not provide third-party star ratings
        ratingCount: undefined,
        websiteUrl: p.website || undefined,
        bookingUrl: undefined, // Never fabricate booking links
        verificationStatus: (isVerified ? 'verified' : 'unverified') as VerificationStatus,
        source: 'geoapify',
        relevanceScore: touristClassification.touristRelevanceScore,
        touristRelevanceScore: touristClassification.touristRelevanceScore,
        placeType: touristClassification.placeType,
        qualityScore: 50,
        travelBurdenScore: 0,
        candidateScore: 50,
        estimatedDurationMin: durationResult.durationMinutes,
        estimatedCostPerPerson: costResult.cost.amountPerPerson || 0,
        actionLinks: {
          directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
          websiteUrl: p.website || undefined,
          bookingUrl: undefined,
        },
      };
    });

    // 7. Deterministic basic filtering
    const feasibleCandidates = rawCandidates.filter((cand) => {
      const { isFeasible } = isCandidateFeasible(cand, corridor);
      return isFeasible;
    });

    const filteredCandidateCount = feasibleCandidates.length;

    // 8. Scoring & Ranking
    const scoringContext: ScoringContext = {
      start: start.coordinates,
      end: end.coordinates,
      corridor,
      userInterests: interests,
      matchedInterests,
      availableTripMinutes: availableMinutes,
      totalBudget: budget?.total,
      perPersonBudget: budget?.perPerson,
      peopleCount,
    };

    const scoredCandidates = feasibleCandidates.map((cand) => {
      const scoreData = scoreCandidate(cand, scoringContext);
      return {
        ...cand,
        candidateScore: scoreData.candidateScore,
        scoreBreakdown: scoreData.breakdown,
        relevanceScore: scoreData.relevanceScore,
        qualityScore: scoreData.qualityScore,
        travelBurdenScore: scoreData.travelBurdenScore,
      };
    });

    // Sort by candidateScore descending
    scoredCandidates.sort((a, b) => b.candidateScore - a.candidateScore);

    // 9. Category-balanced pool selection (target ~10-20 candidates)
    const finalCandidates = this.selectBalancedPool(scoredCandidates, poolTargetSize, interests);

    const finalResult: CandidateDiscoveryResult = {
      success: true,
      candidates: finalCandidates,
      metadata: {
        city,
        categoriesUsed: categorySlices,
        isDefaultStrategy,
        matchedInterests,
        rawCandidateCount,
        deduplicatedCount,
        filteredCandidateCount,
        finalCandidateCount: finalCandidates.length,
        corridor,
        fromCache: false,
        warnings,
      },
    };

    // Save in cache
    this.cache.set(cacheKey, finalResult);

    return finalResult;
  }

  /**
   * Deduplicates Geoapify features.
   * Primary key: place_id
   * Fallback 1: Near-identical coordinates (<= 25m) with category overlap
   * Fallback 2: Identical/near-identical normalized names within 1500m (e.g. multiple park gates/nodes)
   */
  private deduplicateFeatures(
    features: GeoapifyPlacesResponse['features']
  ): GeoapifyPlacesResponse['features'] {
    const seenPlaceIds = new Set<string>();
    const seenEntities: Array<{ name: string; rootName: string; lat: number; lon: number; categories: string[] }> = [];
    const deduplicated: GeoapifyPlacesResponse['features'] = [];

    const normalize = (s: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');

    const getRootName = (s: string) =>
      normalize(s)
        .replace(/\b(phase|sector|block|gate|part|zone|ward|circle|stage)\s*\d+\b/g, '')
        .replace(/\b\d+\b/g, '')
        .trim();

    for (const feat of features) {
      const p = feat.properties;
      const placeId = p.place_id;

      if (placeId && seenPlaceIds.has(placeId)) {
        continue;
      }

      const rawName = p.name || '';
      const normName = normalize(rawName);
      const rootName = getRootName(rawName);
      const lat = p.lat ?? feat.geometry?.coordinates?.[1];
      const lon = p.lon ?? feat.geometry?.coordinates?.[0];
      const cats = (p.categories || []).map((c: string) => c.toLowerCase());

      if (typeof lat === 'number' && typeof lon === 'number') {
        const isDuplicate = seenEntities.some((item) => {
          const dist = calculateHaversineDistance(item.lat, item.lon, lat, lon);

          // 1. Very close coordinates (<= 25m): same physical location
          if (dist <= 25) {
            return true;
          }

          // 2. Exact normalized name within 1500m: same attraction/park entity
          if (normName && item.name === normName && dist <= 1500) {
            return true;
          }

          // 3. Same root name (e.g. "Laxman Rao Park" vs "Laxman Rao Park Phase 2") within 1500m
          if (rootName && rootName.length >= 4 && item.rootName === rootName && dist <= 1500) {
            return true;
          }

          return false;
        });

        if (isDuplicate) {
          continue;
        }

        seenEntities.push({ name: normName, rootName, lat, lon, categories: cats });
      }

      if (placeId) {
        seenPlaceIds.add(placeId);
      }
      deduplicated.push(feat);
    }

    return deduplicated;
  }

  /**
   * Selects a balanced pool across categories from scored candidates.
   */
  private selectBalancedPool(
    candidates: CandidatePlace[],
    targetSize: number,
    interests?: string[]
  ): CandidatePlace[] {
    const wantsReligion = hasReligiousInterest(interests);
    const wantsFood = hasFoodInterest(interests);
    const wantsNature = hasNatureInterest(interests);

    // 1. Filter out low-tier noise when religion is not requested
    const filtered = candidates.filter((cand) => {
      const isReligious =
        cand.category === 'religious' ||
        (cand.categories || []).some((c) => c.includes('place_of_worship'));
      if (isReligious && !wantsReligion) {
        // Exclude ordinary worship places (score < 60)
        return (cand.touristRelevanceScore ?? 50) >= 60;
      }
      return true;
    });

    if (filtered.length <= targetSize) {
      return filtered;
    }

    // 2. Balanced diversity selection with category and type quotas
    const maxPerCategory = Math.max(3, Math.ceil(targetSize / 3));
    const maxFoodStops = wantsFood ? 4 : 2;
    const maxOrdinaryStatues = 1;
    const maxReligiousStops = wantsReligion ? 4 : 0;
    const maxGenericParks = wantsNature ? 4 : 1;

    let foodCount = 0;
    let ordinaryStatueCount = 0;
    let religiousCount = 0;
    let genericParkCount = 0;

    const categoryCounts: Record<string, number> = {};
    const selected: CandidatePlace[] = [];
    const overflow: CandidatePlace[] = [];

    // Sort by composite candidate score & tourist relevance
    const sorted = [...filtered].sort((a, b) => {
      const scoreDiff = b.candidateScore - a.candidateScore;
      if (scoreDiff !== 0) return scoreDiff;
      return (b.touristRelevanceScore ?? 50) - (a.touristRelevanceScore ?? 50);
    });

    for (const cand of sorted) {
      const isFood = cand.category === 'restaurant' || cand.category === 'cafe' || cand.placeType === 'SUPPORT_FOOD';
      const isReligious =
        cand.category === 'religious' ||
        (cand.categories || []).some((c) => c.includes('place_of_worship'));
      const isOrdinaryStatue =
        (cand.categories || []).some((c) => c.includes('statue')) &&
        !(cand.categories || []).some(
          (c) =>
            c.includes('monument') ||
            c.includes('memorial') ||
            c.includes('castle') ||
            c.includes('fort') ||
            c.includes('heritage')
        );
      const isGenericPark =
        (cand.category === 'park' || (cand.categories || []).some((c) => c.startsWith('leisure.park'))) &&
        !(cand.categories || []).some((c) => c === 'leisure.park.garden' || c === 'leisure.nature_reserve') &&
        !/\b(botanical|garden|national park|sanctuary|lake view|biodiversity)\b/i.test(cand.name);

      if (isFood && foodCount >= maxFoodStops) {
        continue;
      }
      if (isReligious && religiousCount >= maxReligiousStops) {
        continue;
      }
      if (isOrdinaryStatue && ordinaryStatueCount >= maxOrdinaryStatues) {
        continue;
      }
      if (isGenericPark && genericParkCount >= maxGenericParks) {
        continue;
      }

      const count = categoryCounts[cand.category] || 0;
      if (count < maxPerCategory && selected.length < targetSize) {
        selected.push(cand);
        categoryCounts[cand.category] = count + 1;
        if (isFood) foodCount++;
        if (isReligious) religiousCount++;
        if (isOrdinaryStatue) ordinaryStatueCount++;
        if (isGenericPark) genericParkCount++;
      } else {
        overflow.push(cand);
      }
    }

    // If still below target size, fill from top overflow prioritizing tourist relevance
    overflow.sort((a, b) => (b.touristRelevanceScore ?? 50) - (a.touristRelevanceScore ?? 50));
    while (selected.length < targetSize && overflow.length > 0) {
      const candidate = overflow.shift()!;
      const isGenericPark =
        (candidate.category === 'park' || (candidate.categories || []).some((c) => c.startsWith('leisure.park'))) &&
        !(candidate.categories || []).some((c) => c === 'leisure.park.garden' || c === 'leisure.nature_reserve') &&
        !/\b(botanical|garden|national park|sanctuary|lake view|biodiversity)\b/i.test(candidate.name);

      if (isGenericPark && genericParkCount >= maxGenericParks) {
        continue;
      }
      selected.push(candidate);
      if (isGenericPark) genericParkCount++;
    }

    return selected;
  }

  // -------------------------------------------------------------------------
  // Backward compatibility methods
  // -------------------------------------------------------------------------

  async geocodeAddress(text: string, biasCity?: string): Promise<LocationPoint | null> {
    const apiKey = this.ensureApiKey();
    const query = biasCity ? `${text}, ${biasCity}` : text;
    const url = new URL(`${this.baseUrl}/v1/geocode/search`);
    url.searchParams.set('text', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('apiKey', apiKey);

    const data = await this.fetchJson<{ results: Array<{ name: string; formatted: string; lat: number; lon: number; place_id: string }> }>(url.toString());
    const match = data.results?.[0];
    if (!match) return null;

    return {
      name: match.name || text,
      address: match.formatted,
      coordinates: { lat: match.lat, lng: match.lon },
      placeId: match.place_id,
      type: 'address',
    };
  }

  async searchPlaceMatches(text: string, biasCity?: string, limit = 4): Promise<LocationPoint[]> {
    const apiKey = this.ensureApiKey();
    const query = biasCity ? `${text}, ${biasCity}` : text;
    const url = new URL(`${this.baseUrl}/v1/geocode/search`);
    url.searchParams.set('text', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('apiKey', apiKey);

    const data = await this.fetchJson<{
      results: Array<{ name: string; formatted: string; lat: number; lon: number; place_id: string }>;
    }>(url.toString());

    if (!data.results || data.results.length === 0) return [];

    // Filter out fallback results where Geoapify just matched the city name instead of the query
    const validMatches = data.results.filter((match) => {
      if (
        biasCity &&
        match.name?.toLowerCase() === biasCity.toLowerCase() &&
        text.toLowerCase() !== biasCity.toLowerCase()
      ) {
        return false;
      }
      return true;
    });

    return validMatches.map((match) => ({
      name: match.name || text,
      address: match.formatted,
      coordinates: { lat: match.lat, lng: match.lon },
      placeId: match.place_id,
      type: 'address',
    }));
  }

  createVerifiedCandidate(
    location: LocationPoint,
    categoryHint?: string,
    city?: string
  ): CandidatePlace {
    const rawCategories = [categoryHint || 'tourism.sights'];
    const category = mapRawCategoriesToPlaceCategory(rawCategories);
    const durationRes = estimateVisitDuration(category, rawCategories);
    const costRes = evaluatePlaceCost({
      category,
      categories: rawCategories,
      peopleCount: 1,
    });

    return {
      id: location.placeId || `img-${Date.now()}`,
      name: location.name,
      category,
      categories: rawCategories,
      latitude: location.coordinates.lat,
      longitude: location.coordinates.lng,
      coordinates: location.coordinates,
      address: location.address,
      city: city || 'Hyderabad',
      openingHours: undefined,
      openingHoursSource: 'unavailable',
      estimatedVisitDurationMinutes: durationRes.durationMinutes,
      estimatedDurationMin: durationRes.durationMinutes,
      visitDurationSource: durationRes.durationSource,
      cost: costRes.cost,
      estimatedCostPerPerson: costRes.cost.amountPerPerson || 0,
      costSource: costRes.costSource,
      verificationStatus: 'verified',
      source: 'user_upload',
      addedViaImage: true,
      relevanceScore: 90,
      touristRelevanceScore: 95,
      placeType: 'PRIMARY_TOURIST',
      qualityScore: 85,
      travelBurdenScore: 0,
      candidateScore: 85,
      actionLinks: {
        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          location.name + ' ' + (location.address || '')
        )}`,
      },
    };
  }

  async searchPlaces(
    city: string,
    center: Coordinates,
    categories: string[] = ['tourism.sights', 'catering.restaurant'],
    limit: number = 20
  ): Promise<CandidatePlace[]> {
    const res = await this.discoverCandidates({
      city,
      start: { coordinates: center },
      end: { coordinates: center },
      interests: categories,
      poolTargetSize: limit,
    });
    return res.candidates;
  }

  async getPlaceDetails(placeId: string): Promise<Partial<CandidatePlace> | null> {
    const apiKey = this.ensureApiKey();
    const url = new URL(`${this.baseUrl}/v2/place-details`);
    url.searchParams.set('id', placeId);
    url.searchParams.set('apiKey', apiKey);

    try {
      const data = await this.fetchJson<{ features: GeoapifyPlacesResponse['features'] }>(url.toString());
      const feature = data.features?.[0];
      if (!feature) return null;

      const p = feature.properties;
      return {
        id: p.place_id,
        name: p.name,
        address: p.formatted,
        actionLinks: {
          websiteUrl: p.website,
          directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`,
        },
        openingHours: p.opening_hours,
      };
    } catch {
      return null;
    }
  }
}
