/**
 * User-Facing Error Mapping Utility.
 *
 * Replaces raw technical errors, stack traces, and internal API exceptions
 * with respectful, actionable user guidance.
 * Never exposes API keys, provider error codes, or stack traces.
 */

export interface UserFacingError {
  title: string;
  message: string;
  actionHint?: string;
}

export function toUserFacingError(err: unknown): UserFacingError {
  const raw = err instanceof Error ? err.message : String(err || '');
  const lower = raw.toLowerCase();

  // Location / Geocoding failure
  if (
    lower.includes('geocode') ||
    lower.includes('location') ||
    lower.includes('could not find') ||
    lower.includes('zero_results') ||
    lower.includes('location_resolution_failure')
  ) {
    return {
      title: 'Location Not Found',
      message: "We couldn't identify that starting point or destination.",
      actionHint: 'Try specifying the neighborhood, landmark, or city (e.g. "VNR VJIET, Bachupally, Hyderabad").',
    };
  }

  // No feasible itinerary / Time window too short
  if (
    lower.includes('infeasible') ||
    lower.includes('deadline') ||
    lower.includes('no feasible') ||
    lower.includes('no_feasible_route') ||
    lower.includes('buffer') ||
    lower.includes('cannot fit')
  ) {
    return {
      title: 'No Feasible Itinerary Found',
      message: 'No combination of activities can currently satisfy your time window, budget, and destination deadline.',
      actionHint: 'A direct start-to-end route is available. You can also try extending your latest arrival time or increasing your budget.',
    };
  }

  // Rate limit / Quota exceeded
  if (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('credits') ||
    lower.includes('limit reached')
  ) {
    return {
      title: 'Service Temporarily Busy',
      message: 'The planning service is temporarily unavailable due to high demand.',
      actionHint: 'Please wait a moment and try again shortly.',
    };
  }

  // Image vision recognition failure
  if (
    lower.includes('vision') ||
    lower.includes('image') ||
    lower.includes('unrecognized') ||
    lower.includes('unsupported image')
  ) {
    return {
      title: 'Image Could Not Be Identified',
      message: "We couldn't confidently identify this photo as a known landmark, monument, or dish.",
      actionHint: 'Try uploading a clearer, higher-resolution photo taken from the front of the site.',
    };
  }

  // Network / Connection failure
  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('network')
  ) {
    return {
      title: 'Network Connection Issue',
      message: 'Unable to reach the routing and planning servers.',
      actionHint: 'Please check your internet connection and try again.',
    };
  }

  // Default friendly fallback (zero technical jargon)
  return {
    title: 'Planning Request Notice',
    message: 'We were unable to complete your plan with the current constraints.',
    actionHint: 'Please review your trip start and end locations and try again.',
  };
}
