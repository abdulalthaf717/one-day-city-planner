/**
 * Domain types for candidate places, opening hours, verification status, and actionable links.
 */

import { Coordinates } from './constraints';

export type PlaceCategory =
  | 'attraction'
  | 'museum'
  | 'historic'
  | 'restaurant'
  | 'cafe'
  | 'park'
  | 'shopping'
  | 'religious'
  | 'entertainment'
  | 'other';

/**
 * Information accuracy requirement:
 * The system must distinguish between verified real-world data,
 * deterministic estimates, and unavailable data. Never fabricate data.
 */
export type VerificationStatus = 'verified' | 'estimated' | 'unavailable' | 'unverified';

export type CostSourceType = 'known' | 'estimated' | 'unknown' | 'free';

export interface PlaceCostInfo {
  amountPerPerson?: number;
  fixedEntryCost?: number;
  estimatedFoodSpend?: number;
  totalForGroup?: number;
  currency: string;
  isFree?: boolean;
}

export type OpeningHoursSource = 'provider' | 'estimated' | 'unavailable';
export type VisitDurationSource = 'provider' | 'category_default' | 'estimated';

export interface CandidateScoreBreakdown {
  interestRelevance: number; // 0 - 100
  geographicPracticality: number; // 0 - 100
  openingCompatibility: number; // 0 - 100
  budgetCompatibility: number; // 0 - 100
  qualitySignal: number; // 0 - 100
  diversityBonus: number; // 0 - 100
  travelBurden: number; // 0 - 100
  totalScore: number; // 0 - 100
}

export interface OpeningPeriod {
  openDay: number; // 0 = Sunday, 1 = Monday, etc.
  openTime: string; // HH:mm
  closeDay: number;
  closeTime: string; // HH:mm
}

export interface OpeningHours {
  rawText?: string;
  isOpenNow?: boolean;
  periods?: OpeningPeriod[];
  isVerified: boolean;
}

export type TouristPlaceType =
  | 'PRIMARY_TOURIST'
  | 'SECONDARY_ATTRACTION'
  | 'SUPPORT_FOOD'
  | 'LOCAL_ATTRACTION';

export interface ActionLinks {
  directionsUrl?: string;
  websiteUrl?: string;
  bookingUrl?: string;
  reservationUrl?: string;
}

export interface CandidatePlace {
  id: string;
  name: string;
  category: PlaceCategory;
  categories: string[];
  latitude: number;
  longitude: number;
  coordinates: Coordinates;
  address?: string;
  city: string;
  country?: string;
  openingHours?: string;
  openingHoursSource: OpeningHoursSource;
  estimatedVisitDurationMinutes: number;
  visitDurationSource: VisitDurationSource;
  cost: PlaceCostInfo;
  costSource: CostSourceType;
  rating?: number;
  ratingCount?: number;
  websiteUrl?: string;
  bookingUrl?: string;
  verificationStatus: VerificationStatus;
  source: 'geoapify' | 'user_upload' | 'verified_catalog';
  relevanceScore: number;
  qualityScore: number;
  travelBurdenScore: number;
  candidateScore: number;
  touristRelevanceScore?: number;
  placeType?: TouristPlaceType;
  scoreBreakdown?: CandidateScoreBreakdown;
  metadata?: Record<string, unknown>;

  // Backward compatibility fields for itinerary & optimizer integration
  estimatedDurationMin: number;
  estimatedCostPerPerson: number;
  actionLinks?: ActionLinks;
  description?: string;
  imageUrl?: string;
  addedViaImage?: boolean;
}
