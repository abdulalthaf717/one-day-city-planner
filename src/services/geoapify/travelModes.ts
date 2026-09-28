/**
 * Geoapify Travel Mode Mapping & Semantic Definitions.
 *
 * Requirements:
 * - Must not pretend an unsupported mode is supported.
 * - Must not silently substitute a different travel mode.
 * - Explicit traffic model tracking: 'approximated' vs 'free_flow' vs 'not_applicable'.
 */

import { TrafficModel, TravelMode } from '@/domain';

export interface TravelModeConfig {
  isValid: true;
  mode: TravelMode;
  apiMode: string;
  trafficModel: TrafficModel;
  semanticLabel: string;
  notes: string;
}

export interface InvalidTravelModeResult {
  isValid: false;
  reason: 'UNSUPPORTED_TRAVEL_MODE';
  message: string;
}

export type TravelModeValidationResult = TravelModeConfig | InvalidTravelModeResult;

const SUPPORTED_MODES: Record<string, TravelModeConfig> = {
  drive: {
    isValid: true,
    mode: 'drive',
    apiMode: 'drive',
    trafficModel: 'approximated',
    semanticLabel: 'traffic-aware approximate estimate',
    notes: 'Based on Geoapify approximated traffic model for motorized road networks.',
  },
  walk: {
    isValid: true,
    mode: 'walk',
    apiMode: 'walk',
    trafficModel: 'not_applicable',
    semanticLabel: 'pedestrian road-network travel estimate',
    notes: 'Calculated using pedestrian walkable paths and sidewalks.',
  },
  bicycle: {
    isValid: true,
    mode: 'bicycle',
    apiMode: 'bicycle',
    trafficModel: 'not_applicable',
    semanticLabel: 'bicycle network travel estimate',
    notes: 'Calculated using bike-friendly paths and elevation gradients.',
  },
  transit: {
    isValid: true,
    mode: 'transit',
    apiMode: 'transit',
    trafficModel: 'not_applicable',
    semanticLabel: 'public transit network estimate',
    notes: 'Requires regional GTFS timetable feed; may return NO_ROUTE in areas without public transit data.',
  },
};

export function validateAndMapTravelMode(mode: string): TravelModeValidationResult {
  const normalized = mode?.trim()?.toLowerCase();
  const config = SUPPORTED_MODES[normalized];

  if (!config) {
    return {
      isValid: false,
      reason: 'UNSUPPORTED_TRAVEL_MODE',
      message: `Travel mode "${mode}" is not supported. Supported travel modes are: ${Object.keys(
        SUPPORTED_MODES
      ).join(', ')}.`,
    };
  }

  return config;
}
