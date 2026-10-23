/**
 * API Route: /api/copilot
 * Server-side entry point for Trip Copilot Chatbot.
 *
 * Keeps GROQ_API_KEY and GEOAPIFY_API_KEY protected.
 * Dispatches natural language requests into deterministic planner actions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TripCopilotEngine } from '@/copilot';
import { TripConstraints } from '@/domain';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      message,
      constraints,
      itinerary,
      plannerState,
      history,
      conversationHistory,
      userPreferences,
      pendingProposal,
      lastDiscussedPlace,
      simulateOnly,
    } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { success: false, error: 'Missing or empty "message" parameter.' },
        { status: 400 }
      );
    }

    if (!constraints) {
      return NextResponse.json(
        { success: false, error: 'Missing trip "constraints" object.' },
        { status: 400 }
      );
    }

    const engine = new TripCopilotEngine();
    const result = await engine.processMessage({
      message: message.trim(),
      constraints: constraints as TripConstraints,
      itinerary,
      plannerState,
      history: Array.isArray(history) ? history : [],
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      userPreferences,
      pendingProposal,
      lastDiscussedPlace,
      simulateOnly: Boolean(simulateOnly),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown Copilot processing error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
