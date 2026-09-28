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
      const currentCost = itinerary.summary.totalCost || 0;
      const placeCost = candidatePlace.cost.totalForGroup || candidatePlace.cost.amountPerPerson || 0;
      const projectedCost = currentCost + placeCost;
      const budgetLimit = constraints.budget.total;

      const fitsTime = currentSafetyBuffer >= totalExtraTimeNeeded;
      const fitsBudget = projectedCost <= budgetLimit;
      const canFit = fitsTime && fitsBudget;

      const delayMinutes = fitsTime ? 0 : totalExtraTimeNeeded - currentSafetyBuffer;

      let reason = '';
      if (canFit) {
        reason = `${candidatePlace.name} can be added while keeping your current time, budget, and end-point constraints.`;
      } else if (!fitsTime && !fitsBudget) {
        reason = `${candidatePlace.name} cannot be added without exceeding both your arrival deadline (by ~${delayMinutes}m) and budget limit (by ${constraints.budget.currency}${projectedCost - budgetLimit}).`;
      } else if (!fitsTime) {
        reason = `${candidatePlace.name} cannot be added to the current itinerary without violating your available time (requires ${totalExtraTimeNeeded}m, but current buffer is ${currentSafetyBuffer}m).`;
      } else {
        reason = `${candidatePlace.name} fits your schedule but exceeds your budget by ${constraints.budget.currency}${projectedCost - budgetLimit}.`;
      }

      return NextResponse.json({
        success: true,
        feasibility: {
          canFit,
          fitsTime,
          fitsBudget,
          visitDurationMinutes: visitMinutes,
          additionalTravelMinutes,
          remainingBufferMinutes: currentSafetyBuffer,
          delayMinutes,
          costIncrease: placeCost,
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
        fitsBudget: true,
        visitDurationMinutes: visitMinutes,
        additionalTravelMinutes,
        remainingBufferMinutes: Math.max(0, windowMinutes - (totalExtraTimeNeeded + 30)),
        delayMinutes: canFit ? 0 : (totalExtraTimeNeeded + 30) - windowMinutes,
        costIncrease: candidatePlace.cost.totalForGroup || 0,
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
