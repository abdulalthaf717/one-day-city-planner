/**
 * HTTP Test Runner: GET /api/agent/run-tests
 *
 * Runs Planner Agent test cases A through J and returns structured JSON report.
 */

import { NextResponse } from 'next/server';
import { runAgentTests } from '@/tools/agentTestRunner';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await runAgentTests();
    const statusCode = report.failedTests === 0 ? 200 : 207;
    return NextResponse.json(report, { status: statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'AGENT_TEST_SUITE_CRASH',
        message,
      },
      { status: 500 }
    );
  }
}
