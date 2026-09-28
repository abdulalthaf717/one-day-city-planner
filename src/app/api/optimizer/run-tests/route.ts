/**
 * HTTP Test Runner: GET /api/optimizer/run-tests
 *
 * Runs deterministic itinerary optimizer test cases A through I and returns structured JSON report.
 */

import { NextResponse } from 'next/server';
import { runOptimizerTests } from '@/tools/optimizerTestRunner';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await runOptimizerTests();
    const statusCode = report.failedTests === 0 ? 200 : 207;
    return NextResponse.json(report, { status: statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'OPTIMIZER_TEST_SUITE_CRASH',
        message,
      },
      { status: 500 }
    );
  }
}
