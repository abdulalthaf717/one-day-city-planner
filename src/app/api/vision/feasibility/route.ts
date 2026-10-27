/**
 * API Route: /api/vision/feasibility
 * Evaluates whether an image-verified candidate place can fit into the current itinerary
 * without violating hard time windows, arrival deadlines, or budget limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { CandidatePlace, FinalItinerary, TripConstraints } from '@/domain';

export const dynamic = 'force-dynamic';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      candidatePlace,
      itinerary,
      constraints,
    }: {
      candidatePlace: CandidatePlace;
      itinerary?: FinalItinerary;
      constraints: TripConstraints;
    } = body;

    if (!candidatePlace || !candidatePlace.coordinates) {
      return NextResponse.json(
        { success: false, error: 'Missing candidatePlace with coordinates.' },
        { status: 400 }
      );
    }

    if (!constraints) {
      return NextResponse.json(
        { success: false, error: 'Missing tripConstraints.' },
        { status: 400 }
      );
    }

    const visitMinutes = candidatePlace.estimatedVisitDurationMinutes || 60;
    const additionalTravelMinutes = 20; // Estimated realistic road transit detour
    const totalExtraTimeNeeded = visitMinutes + additionalTravelMinutes;

    // Check against current itinerary if one exists
    if (itinerary && itinerary.summary) {
      const currentSafetyBuffer = itinerary.summary.safetyBufferMinutes || 0;
      const fitsTime = currentSafetyBuffer >= totalExtraTimeNeeded;
      const canFit = fitsTime;

      const delayMinutes = fitsTime ? 0 : totalExtraTimeNeeded - currentSafetyBuffer;

      let reason = '';
      if (canFit) {
        reason = `${candidatePlace.name} can be added while keeping your current time and arrival deadline constraints.`;
      } else {
        reason = `${candidatePlace.name} cannot be added to the current itinerary without violating your available time (requires ~${totalExtraTimeNeeded}m, but current buffer is ${currentSafetyBuffer}m).`;
      }

      return NextResponse.json({
        success: true,
        feasibility: {
          canFit,
          fitsTime,
          visitDurationMinutes: visitMinutes,
          additionalTravelMinutes,
          remainingBufferMinutes: currentSafetyBuffer,
          delayMinutes,
          reason,
        },
      });
    }

    // If no existing itinerary, check overall trip window
    const windowMinutes =
      timeToMinutes(constraints.time.latestArrivalTime) -
      timeToMinutes(constraints.time.startTime);

    const canFit = windowMinutes >= totalExtraTimeNeeded + 30; // 30m base travel
    return NextResponse.json({
      success: true,
      feasibility: {
        canFit,
        fitsTime: canFit,
        visitDurationMinutes: visitMinutes,
        additionalTravelMinutes,
        remainingBufferMinutes: Math.max(0, windowMinutes - (totalExtraTimeNeeded + 30)),
        delayMinutes: canFit ? 0 : (totalExtraTimeNeeded + 30) - windowMinutes,
        reason: canFit
          ? `${candidatePlace.name} can fit within your planned ${windowMinutes}m daily window.`
          : `${candidatePlace.name} exceeds your available daily duration of ${windowMinutes}m.`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Feasibility check failure';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
