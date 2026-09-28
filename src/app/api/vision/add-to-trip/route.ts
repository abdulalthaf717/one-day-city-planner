/**
 * API Route: /api/vision/add-to-trip
 * Integrates an image-verified candidate place into the planner state and re-optimizes.
 *
 * Principles:
 * - Does not blindly append to the end of the day.
 * - Adds to the candidate pool with priority.
 * - Re-evaluates road route matrix and deterministic beam search optimizer.
 * - Re-evaluates 14 hard constraint validator checks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PlannerAgent } from '@/agent';
import { CandidatePlace, PlannerState, TripConstraints } from '@/domain';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      candidatePlace,
      constraints,
      previousState,
      forceInclude,
    }: {
      candidatePlace: CandidatePlace;
      constraints: TripConstraints;
      previousState?: PlannerState;
      forceInclude?: boolean;
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

    // Mark candidate as user-requested from image
    const userCandidate: CandidatePlace = {
      ...candidatePlace,
      addedViaImage: true,
      source: 'user_upload',
      candidateScore: Math.max(candidatePlace.candidateScore || 85, 95), // Boost candidate score
    };

    // Prepare updated state with candidate included
    const existingCandidates = previousState?.candidates || [];
    const dedupedCandidates = existingCandidates.filter(
      (c) => c.id !== userCandidate.id && c.name.toLowerCase() !== userCandidate.name.toLowerCase()
    );
    const updatedCandidates = [userCandidate, ...dedupedCandidates];

    // Reset route matrix to incorporate new stop transitions
    const updatedState: PlannerState = {
      ...(previousState || {
        tripConstraints: constraints,
        planningVersion: 1,
        warnings: [],
      }),
      candidates: updatedCandidates,
      routeMatrix: undefined, // Force recalculation with new point
      currentItinerary: undefined,
      validationResult: undefined,
      planningVersion: (previousState?.planningVersion || 1) + 1,
    };

    const agent = new PlannerAgent();
    const result = await agent.planTrip(
      constraints,
      updatedState,
      forceInclude
        ? `User requested mandatory addition of "${candidatePlace.name}" via photo upload.`
        : `User requested addition of "${candidatePlace.name}" via photo upload.`
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add place to trip';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
