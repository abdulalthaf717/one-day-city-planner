/**
 * API Route: /api/plan
 * Server-side entry point for Agentic trip planning and dynamic replanning.
 * Keeps GROQ_API_KEY and GEOAPIFY_API_KEY completely protected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PlannerAgent } from '@/agent';
import { PlannerState, TripConstraints } from '@/domain';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { constraints, previousState, previousPlan, userMessage } = body;

    if (!constraints) {
      return NextResponse.json(
        {
          success: false,
          error: 'REQUEST_BODY_ERROR: "constraints" object is required in request body.',
        },
        { status: 400 }
      );
    }

    // Convert previousPlan to previousState if only previousPlan is passed
    let resolvedPreviousState: PlannerState | undefined = previousState;
    if (!resolvedPreviousState && previousPlan) {
      resolvedPreviousState = {
        tripConstraints: constraints,
        currentItinerary: previousPlan,
        candidates: [],
        planningVersion: previousPlan.version || 1,
        warnings: [],
      };
    }

    const agent = new PlannerAgent();
    const result = await agent.planTrip(
      constraints as TripConstraints,
      resolvedPreviousState,
      userMessage
    );

    return NextResponse.json(result, { status: result.success ? 200 : 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown planning failure';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
