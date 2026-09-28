/**
 * HTTP Test Runner: GET /api/candidates/run-tests
 *
 * Runs candidate discovery test cases A through G and returns structured JSON report.
 */

import { NextResponse } from 'next/server';
import { runCandidateDiscoveryTests } from '@/tools/candidateTestRunner';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await runCandidateDiscoveryTests();
    const statusCode = report.failedTests === 0 ? 200 : 207;
    return NextResponse.json(report, { status: statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'CANDIDATE_TEST_SUITE_CRASH',
        message,
      },
      { status: 500 }
    );
  }
}
