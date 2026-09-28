/**
 * API Route: /api/vision
 * Multimodal image understanding & Geoapify place verification endpoint.
 *
 * Principles:
 * - Server-side only: GROQ_API_KEY and GEOAPIFY_API_KEY are strictly protected.
 * - Strict input validation: Rejects unsupported MIME types and oversized files.
 * - Zero hallucination: Place facts (coordinates, addresses, opening hours, costs)
 *   are strictly verified via Geoapify rather than hallucinated by the vision model.
 * - Supports landmarks, monuments, food dishes, event posters, and tourist maps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GroqService } from '@/services/groq/client';
import { GeoapifyPlacesService } from '@/services/geoapify';
import { CandidatePlace } from '@/domain';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4MB base64 ceiling

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { imageBase64, mimeType, city } = body;

    // 1. Image Input Security & Validation
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_PAYLOAD: Missing or invalid "imageBase64" string.' },
        { status: 400 }
      );
    }

    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return NextResponse.json(
        {
          error: `UNSUPPORTED_FORMAT: Format "${mimeType}" is not supported. Supported image formats: image/jpeg, image/png, image/webp.`,
        },
        { status: 400 }
      );
    }

    // Rough byte length check on base64 (3/4 ratio)
    const approximateBytes = Math.ceil((imageBase64.length * 3) / 4);
    if (approximateBytes > MAX_IMAGE_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `PAYLOAD_TOO_LARGE: Uploaded image size (~${Math.round(
            approximateBytes / 1024 / 1024
          )}MB) exceeds maximum safe upload limit of 4MB.`,
        },
        { status: 413 }
      );
    }

    const groq = new GroqService();
    const placesService = new GeoapifyPlacesService();

    // 2. Groq Multimodal Vision Analysis (qwen/qwen3.8-27b)
    const analysis = await groq.analyzeLandmarkImage(imageBase64, mimeType, city);

    // 3. Category-Specific Place Verification
    let verifiedPlace: CandidatePlace | null = null;
    let isVerified = false;
    let verificationMessage = '';
    const alternativeMatches: Array<{ name: string; address?: string; placeId?: string }> = [];
    const recommendedRestaurants: CandidatePlace[] = [];
    const verifiedMapPlaces: CandidatePlace[] = [];

    // Case A: Tourist Attraction / Landmark / Monument
    if (analysis.identifiedType === 'tourist_place') {
      const searchQuery = analysis.searchQueryForVerification || analysis.identifiedName;
      const matches = await placesService.searchPlaceMatches(searchQuery, city, 4);

      if (matches.length > 0) {
        // Construct primary CandidatePlace using real Geoapify coordinates & address
        verifiedPlace = placesService.createVerifiedCandidate(
          matches[0],
          analysis.categorySuggestion,
          city
        );
        isVerified = true;
        verificationMessage = `Verified "${matches[0].name}" in ${city || 'the area'} via Geoapify Directory.`;

        // Gather alternative matches for disambiguation if multiple found
        for (let i = 1; i < matches.length; i++) {
          alternativeMatches.push({
            name: matches[i].name,
            address: matches[i].address,
            placeId: matches[i].placeId,
          });
        }
      } else {
        isVerified = false;
        verificationMessage =
          "I identified this as a possible match, but I couldn't verify the location with the available place data.";
      }
    }

    // Case B: Food / Dish / Beverage (Do NOT invent a restaurant)
    else if (analysis.identifiedType === 'food') {
      isVerified = false;
      verificationMessage = `I identified this as ${analysis.identifiedName}, but I couldn't identify a specific restaurant from the image.`;

      // Search real restaurants in the city serving related cuisine
      try {
        const foodCandidates = await placesService.discoverCandidates({
          city: city || 'Hyderabad',
          start: { coordinates: { lat: 17.385, lng: 78.4867 } },
          end: { coordinates: { lat: 17.385, lng: 78.4867 } },
          interests: ['catering.restaurant'],
          poolTargetSize: 4,
        });
        if (foodCandidates.candidates.length > 0) {
          recommendedRestaurants.push(...foodCandidates.candidates.slice(0, 4));
        }
      } catch {
        // Continue gracefully without fabrication
      }
    }

    // Case C: Event Poster
    else if (analysis.identifiedType === 'event_poster') {
      verificationMessage = `Detected event poster: ${analysis.identifiedName}.`;
      if (analysis.eventDetails?.venue) {
        const venueMatch = await placesService.geocodeAddress(analysis.eventDetails.venue, city);
        if (venueMatch) {
          verifiedPlace = placesService.createVerifiedCandidate(venueMatch, 'entertainment', city);
          isVerified = true;
        }
      }
    }

    // Case D: Tourism Map (Multiple places extraction)
    else if (analysis.identifiedType === 'tourism_map' && analysis.mapExtractedPlaces) {
      verificationMessage = `Identified tourist map showing ${analysis.mapExtractedPlaces.length} possible places.`;
      for (const placeName of analysis.mapExtractedPlaces.slice(0, 4)) {
        try {
          const match = await placesService.geocodeAddress(placeName, city);
          if (match) {
            verifiedMapPlaces.push(
              placesService.createVerifiedCandidate(match, 'tourism.sights', city)
            );
          }
        } catch {
          // Continue with next place
        }
      }
      if (verifiedMapPlaces.length > 0) {
        verifiedPlace = verifiedMapPlaces[0];
        isVerified = true;
      }
    }

    // Case E: Unrecognized / Ambiguous
    else {
      isVerified = false;
      verificationMessage =
        "The image could not be definitively recognized as a known tourist attraction or travel destination.";
    }

    return NextResponse.json({
      success: true,
      analysis: {
        identifiedType: analysis.identifiedType,
        identifiedName: analysis.identifiedName,
        city: analysis.city,
        description: analysis.description,
        confidence: analysis.confidence,
        confidenceScore: analysis.confidenceScore,
        reasoningSummary: analysis.reasoning,
        possibleAlternatives: alternativeMatches,
        eventDetails: analysis.eventDetails,
        mapExtractedPlaces: verifiedMapPlaces.length > 0 ? verifiedMapPlaces.map((p) => p.name) : undefined,
      },
      verifiedPlace,
      isVerified,
      verificationMessage,
      recommendedRestaurants,
      verifiedMapPlaces,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Vision analysis failure';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
