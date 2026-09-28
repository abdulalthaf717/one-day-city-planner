/**
 * Geoapify Geocoding Service.
 *
 * Core Principles:
 * - Appends city and country context to locationText to prevent ambiguous multi-city mismatches.
 * - Free-form search uses GET /v1/geocode/search with text=, format=json, limit=1, apiKey=.
 * - Captures safe sanitized diagnostics on failure (status, content-type, body, sanitized URL).
 * - NEVER logs or exposes the actual API key.
 * - NEVER fabricates coordinates.
 */

import { GeoapifyClient } from './client';
import { GeoapifyGeocodeResult } from './types';

export interface GeocodeRequest {
  city: string;
  locationText: string;
  country?: string;
}

export type GeocodeSuccess = {
  success: true;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  name: string;
  city?: string;
  country?: string;
  source: 'geoapify';
};

export interface GeocodeDiagnostics {
  queryUsed: string;
  cityContext: string;
  sanitizedUrl: string;
  httpStatus?: number;
  contentType?: string;
  rawResponseBody?: string;
  geoapifyErrorCode?: string;
  resultsCount?: number;
}

export type GeocodeFailure = {
  success: false;
  reason: 'LOCATION_NOT_FOUND' | 'API_KEY_MISSING' | 'QUOTA_EXCEEDED' | 'GEOCODING_ERROR';
  message: string;
  diagnostics?: GeocodeDiagnostics;
};

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

export interface StartAndEndResolutionResult {
  city: string;
  start: GeocodeResult;
  end: GeocodeResult;
  bothResolved: boolean;
}

/**
 * Normalizes user free-form location text with city and country context without duplications.
 *
 * Examples:
 * "VNR VJIET", "Hyderabad" -> "VNR VJIET, Hyderabad, India"
 * "Hyderabad Railway Station", "Hyderabad" -> "Hyderabad Railway Station, Hyderabad, India"
 * "VNR VJIET, Hyderabad", "Hyderabad" -> "VNR VJIET, Hyderabad, India"
 * "VNR VJIET, Hyderabad, India", "Hyderabad" -> "VNR VJIET, Hyderabad, India"
 */
export function normalizeGeocodeQuery(
  locationText: string,
  city?: string,
  country: string = 'India'
): string {
  const trimmed = locationText.trim().replace(/,\s*$/, '');
  const cleanCity = city?.trim();
  const cleanCountry = country.trim();

  const lower = trimmed.toLowerCase();
  const cityLower = cleanCity ? cleanCity.toLowerCase() : '';
  const countryLower = cleanCountry.toLowerCase();

  // Check if query already has `, ${city}` as a suffix or comma-separated qualifier
  const hasCityQualifier = cleanCity
    ? lower.endsWith(', ' + cityLower) ||
      lower.includes(', ' + cityLower + ',') ||
      lower.includes(', ' + cityLower + ' ') ||
      lower.endsWith(', ' + cityLower + ', ' + countryLower)
    : false;

  const hasCountryQualifier =
    lower.endsWith(', ' + countryLower) ||
    lower.endsWith(' ' + countryLower) ||
    lower.includes(', ' + countryLower + ',');

  let query = trimmed;
  if (!hasCityQualifier && cleanCity) {
    query = `${query}, ${cleanCity}`;
  }
  if (!hasCountryQualifier && cleanCountry) {
    query = `${query}, ${cleanCountry}`;
  }

  return query;
}

export class GeoapifyGeocodingService extends GeoapifyClient {
  /**
   * Geocodes a single location using Geoapify Forward Geocoding with format=json
   */
  async geocodeLocation(request: GeocodeRequest): Promise<GeocodeResult> {
    const { city, locationText, country = 'India' } = request;

    if (!locationText || !locationText.trim()) {
      return {
        success: false,
        reason: 'LOCATION_NOT_FOUND',
        message: 'Location text cannot be empty.',
      };
    }

    let apiKey: string;
    try {
      apiKey = this.ensureApiKey();
    } catch (err: unknown) {
      return {
        success: false,
        reason: 'API_KEY_MISSING',
        message: err instanceof Error ? err.message : 'GEOAPIFY_API_KEY is not configured.',
      };
    }

    const query = normalizeGeocodeQuery(locationText, city, country);

    const url = new URL(`${this.baseUrl}/v1/geocode/search`);
    url.searchParams.set('text', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('apiKey', apiKey);

    const sanitizedUrl = this.sanitizeUrl(url.toString());

    let res: Response;
    let responseText = '';

    try {
      res = await fetch(url.toString());
      responseText = await res.text();
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : 'Network failure';
      return {
        success: false,
        reason: 'GEOCODING_ERROR',
        message: `Network error connecting to Geoapify: ${this.sanitizeUrl(msg)}`,
        diagnostics: {
          queryUsed: query,
          cityContext: city,
          sanitizedUrl,
        },
      };
    }

    const contentType = res.headers.get('content-type') || '';

    // Handle HTTP status failures
    if (!res.ok) {
      if (res.status === 429) {
        return {
          success: false,
          reason: 'QUOTA_EXCEEDED',
          message: 'Location/routing service quota or rate limit reached. Please try again later.',
          diagnostics: {
            queryUsed: query,
            cityContext: city,
            sanitizedUrl,
            httpStatus: res.status,
            contentType,
            rawResponseBody: responseText.slice(0, 300),
          },
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          reason: 'API_KEY_MISSING',
          message: 'Geoapify API key is invalid, missing, or unauthorized.',
          diagnostics: {
            queryUsed: query,
            cityContext: city,
            sanitizedUrl,
            httpStatus: res.status,
            contentType,
          },
        };
      }

      return {
        success: false,
        reason: 'GEOCODING_ERROR',
        message: `Geoapify geocoding request failed with HTTP ${res.status}.`,
        diagnostics: {
          queryUsed: query,
          cityContext: city,
          sanitizedUrl,
          httpStatus: res.status,
          contentType,
          rawResponseBody: responseText.slice(0, 300),
        },
      };
    }

    // Parse JSON safely
    let data: {
      results?: GeoapifyGeocodeResult[];
      features?: Array<{
        properties: GeoapifyGeocodeResult;
        geometry?: { coordinates: [number, number] };
      }>;
      statusCode?: number;
      error?: string;
      message?: string;
    };

    try {
      data = JSON.parse(responseText);
    } catch {
      return {
        success: false,
        reason: 'GEOCODING_ERROR',
        message: 'Failed to parse JSON response from Geoapify.',
        diagnostics: {
          queryUsed: query,
          cityContext: city,
          sanitizedUrl,
          httpStatus: res.status,
          contentType,
          rawResponseBody: responseText.slice(0, 300),
        },
      };
    }

    // Support both format=json (data.results) and fallback GeoJSON (data.features)
    const match = data.results?.[0] || data.features?.[0]?.properties;
    const lat =
      typeof match?.lat === 'number'
        ? match.lat
        : data.features?.[0]?.geometry?.coordinates?.[1];
    const lon =
      typeof match?.lon === 'number'
        ? match.lon
        : data.features?.[0]?.geometry?.coordinates?.[0];

    const resultsCount = data.results?.length ?? data.features?.length ?? 0;

    // Zero results or missing coordinates
    if (!match || typeof lat !== 'number' || typeof lon !== 'number') {
      return {
        success: false,
        reason: 'LOCATION_NOT_FOUND',
        message: `Could not resolve location "${locationText}" in "${city}" (Query: "${query}").`,
        diagnostics: {
          queryUsed: query,
          cityContext: city,
          sanitizedUrl,
          httpStatus: res.status,
          contentType,
          resultsCount,
          rawResponseBody: responseText.slice(0, 200),
        },
      };
    }

    // Guard against generic fallback matches:
    // If the user provided a specific place name (not just the city name itself),
    // but Geoapify dropped the unknown tokens and fell back to matching the city/district/country level,
    // we must treat it as LOCATION_NOT_FOUND rather than falsely pretending the place was located at city center.
    const isExplicitCityQuery = locationText.trim().toLowerCase() === city.trim().toLowerCase();
    const isCityOrDistrictFallback =
      match.rank?.match_type === 'match_by_city_or_disrict' ||
      match.rank?.match_type === 'match_by_country' ||
      (typeof match.rank?.confidence === 'number' &&
        match.rank.confidence < 0.3 &&
        (match.result_type === 'city' || match.result_type === 'country'));

    if (!isExplicitCityQuery && isCityOrDistrictFallback) {
      return {
        success: false,
        reason: 'LOCATION_NOT_FOUND',
        message: `Could not resolve location "${locationText}" in "${city}". The search returned a generic fallback to the city/district boundary rather than the requested place.`,
        diagnostics: {
          queryUsed: query,
          cityContext: city,
          sanitizedUrl,
          httpStatus: res.status,
          contentType,
          resultsCount,
          rawResponseBody: responseText.slice(0, 200),
        },
      };
    }

    return {
      success: true,
      formattedAddress: match.formatted || locationText.trim(),
      latitude: lat,
      longitude: lon,
      placeId: match.place_id,
      name: match.name || locationText.trim(),
      city: match.city || city.trim(),
      country: match.country || country,
      source: 'geoapify',
    };
  }

  /**
   * Resolves both starting point and ending point safely
   */
  async resolveStartAndEnd(
    city: string,
    startText: string,
    endText: string
  ): Promise<StartAndEndResolutionResult> {
    const [start, end] = await Promise.all([
      this.geocodeLocation({ city, locationText: startText }),
      this.geocodeLocation({ city, locationText: endText }),
    ]);

    return {
      city,
      start,
      end,
      bothResolved: start.success && end.success,
    };
  }
}
