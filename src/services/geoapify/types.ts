/**
 * Geoapify API raw types and request parameters.
 * Free tier quota: 3,000 requests per day across all endpoints.
 */


export interface GeoapifyGeocodeResult {
  name: string;
  formatted: string;
  lat: number;
  lon: number;
  place_id?: string;
  city?: string;
  country?: string;
  result_type?: string;
  rank?: {
    importance?: number;
    popularity?: number;
    confidence?: number;
    confidence_city_level?: number;
    confidence_street_level?: number;
    match_type?: string;
  };
}

export interface GeoapifyPlaceProperties {
  name: string;
  country?: string;
  city?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  categories: string[];
  details?: string[];
  lat: number;
  lon: number;
  place_id: string;
  website?: string;
  contact?: {
    phone?: string;
    email?: string;
  };
  opening_hours?: string;
  facilities?: Record<string, boolean>;
}

export interface GeoapifyPlacesResponse {
  type: string;
  features: Array<{
    type: string;
    properties: GeoapifyPlaceProperties;
    geometry: {
      type: string;
      coordinates: [number, number]; // [lon, lat]
    };
  }>;
}

export interface GeoapifyRouteLeg {
  distance: number; // in meters
  time: number; // in seconds
  steps?: Array<{
    instruction: { text: string };
    distance: number;
    time: number;
  }>;
}

export interface GeoapifyRoutingResponse {
  type: string;
  features: Array<{
    type: string;
    properties: {
      mode: string;
      legs: GeoapifyRouteLeg[];
      distance: number;
      time: number;
    };
    geometry: {
      type: string;
      coordinates: [number, number][]; // polyline coordinates
    };
  }>;
}

export interface GeoapifyRouteMatrixResponse {
  sources_to_targets: Array<
    Array<{
      distance: number; // in meters
      time: number; // in seconds
      source_index: number;
      target_index: number;
    }>
  >;
}
