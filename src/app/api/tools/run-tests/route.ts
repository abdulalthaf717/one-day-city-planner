/**
 * API Route: /api/tools/run-tests
 *
 * Runs the automated Geoapify test suite (TEST A - TEST F) and returns structured JSON results.
 */

import { NextResponse } from 'next/server';
import { runRoutingToolTests } from '@/tools/testRunner';

export async function GET() {
  try {
    const report = await runRoutingToolTests();
    return NextResponse.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Test runner error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
