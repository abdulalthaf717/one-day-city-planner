/**
 * Domain types for the chronological itinerary timeline and summary metrics.
 */

import { LocationPoint, TravelMode } from './constraints';
import { ActionLinks, CandidatePlace, VerificationStatus } from './places';
import { RouteSegment } from './routing';

export type ActivityType = 'start' | 'place' | 'meal' | 'travel' | 'buffer' | 'end';

export type OpeningStatus = 'verified_open' | 'unverified' | 'waited_for_opening' | 'closed';
export type BudgetStatus = 'within_budget' | 'uncertain' | 'exceeded';
export type FeasibilityStatus = 'FEASIBLE' | 'PARTIAL' | 'NO_FEASIBLE_ROUTE';

export interface OptimizerScoreBreakdown {
  activityUtility: number;
  interestUtility: number;
  qualityUtility: number;
  diversityUtility: number;
  travelTimePenalty: number;
  detourPenalty: number;
  riskPenalty: number;
  uncertaintyPenalty: number;
  finalScore: number;
}

export interface ItineraryStop {
  id: string;
  type: ActivityType;
  title: string;
  name?: string;
  placeId?: string;
  place?: CandidatePlace;
  arrivalTime: string; // HH:mm format (e.g., "10:40")
  departureTime: string; // HH:mm format (e.g., "12:00")
  durationMinutes: number;
  visitDurationMinutes?: number;
  travelFromPreviousMinutes?: number;
  travelFromPreviousMeters?: number;
  estimatedCost?: number;
  openingStatus?: OpeningStatus;
  costConfidence?: 'known' | 'estimated' | 'uncertain' | 'unknown' | 'free';
  durationConfidence?: 'provider' | 'category_default' | 'estimated';
  cost: {
    perPerson: number;
    total: number;
    isEstimate: boolean;
  };
  travelFromPrevious?: {
    distanceMeters: number;
    durationMinutes: number;
    mode: TravelMode;
    routeSegment?: RouteSegment;
  };
  actionLinks?: ActionLinks;
  verificationStatus: VerificationStatus;
  notes?: string;
}

export interface ItinerarySummary {
  totalCost: number;
  currency: string;
  totalTravelTimeMinutes: number;
  totalActivityTimeMinutes: number;
  safetyBufferMinutes: number;
  plannedArrivalTime: string; // Arrival at user's end point
  deadlineArrivalTime: string; // User's required latest arrival time
  placeCount: number;
  majorAssumptions: string[];
  unavailableOrEstimatedInfo: string[];
}

export interface FinalItinerary {
  id: string;
  version: number;
  city: string;
  stops: ItineraryStop[];
  summary: ItinerarySummary;
  generatedAt: string;

  // Milestone 4 explicit fields
  start?: LocationPoint;
  end?: LocationPoint;
  startTime?: string;
  plannedEndTime?: string;
  latestAllowedEndTime?: string;
  totalTravelMinutes?: number;
  totalVisitMinutes?: number;
  totalTripMinutes?: number;
  totalDistanceMeters?: number;
  estimatedTotalCost?: number;
  budget?: number;
  budgetStatus?: BudgetStatus;
  safetyBufferMinutes?: number;
  score?: number;
  scoreBreakdown?: OptimizerScoreBreakdown;
  feasibilityStatus?: FeasibilityStatus;
  warnings?: string[];
  assumptions?: string[];
}
